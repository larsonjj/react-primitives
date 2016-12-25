const generateCss = require('./generateCss');
const murmurHash = require('./murmurHash');
const mapKeyValue = require('../util/mapKeyValue');
const injector = require('./injector');

let _id = 1;
const guid = () => _id++;
// store the key in a dictionary with a non-numeric key, since using numeric keys will cause the
// JS VM to treat it like an array.
const KEY = id => `r${id}`;
const styleRegistry = {};

const createCssRule = (prefix, key, rule, genCss) => {
  const cssBody = generateCss(rule);
  // key is the media query, eg. '@media (max-width: 600px)'
  const className = `${prefix}${murmurHash(key + cssBody)}`;
  const css = genCss(key, className, cssBody);
  // this adds the rule to the buffer to be injected into the document
  injector.addRule(className, css);
  return {
    key,
    className,
    rule,
    css,
  };
};

const extractRules = (name, style) => {
  const declarations = {};
  // media queries and pseudo styles are the exception, not the rule, so we are going to assume
  // they are null most of the time and only create an object when we need to.
  let mediaQueries = null;
  let pseudoStyles = null;
  let prefix = 'r';

  if (process.env.NODE_ENV === 'development') {
    prefix = `${name}_`;
  }

  Object.keys(style).forEach(key => {
    if (key[0] === ':') {
      pseudoStyles = pseudoStyles || {};
      pseudoStyles[key] = createCssRule(
        prefix,
        key,
        style[key],
        (pseudo, className, body) => `.${className}${key}{${body}}`
      );
    } else if (key[0] === '@') {
      mediaQueries = mediaQueries || {};
      mediaQueries[key] = createCssRule(
        prefix,
        key,
        style[key],
        (query, className, body) => `${query}{.${className}{${body}}}`
      );
    } else {
      declarations[key] = style[key];
    }
  });

  const cssClass = createCssRule(
    prefix,
    '',
    declarations,
    (_, className, body) => `.${className}{${body}}`
  );

  let classNames = cssClass.className;

  if (mediaQueries) {
    classNames += ` ${mapKeyValue(mediaQueries, (_, rule) => rule.className).join(' ')}`;
  }

  if (pseudoStyles) {
    classNames += ` ${mapKeyValue(pseudoStyles, (_, rule) => rule.className).join(' ')}`;
  }

  return {
    declarations,
    classNames,
    cssClass,
    mediaQueries,
    pseudoStyles,
  };
};

const registerStyle = (name, style) => {
  // TODO(lmr):
  // do "proptype"-like validation here in non-production build
  const id = guid();
  styleRegistry[KEY(id)] = {
    value: null,
    // since styles are normally registered at module execution time, there's some benefit to us
    // not doing that work here, and instead holding off until the rules are needed.
    thunk: () => extractRules(name, style),
  };
  return id;
};

const getRegisteredStyle = id => {
  const obj = styleRegistry[KEY(id)];
  if (obj.value === null) {
    obj.value = obj.thunk();
  }
  return obj.value;
};

const getStyle = id => getRegisteredStyle(id).declarations;

const getClassNames = id => getRegisteredStyle(id).classNames;

module.exports = {
  registerStyle,
  getStyle,
  getClassNames,
};