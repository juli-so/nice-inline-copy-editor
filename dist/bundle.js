(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* See LICENSE file for terms of use */

/*
 * Text diff implementation.
 *
 * This library supports the following APIS:
 * JsDiff.diffChars: Character by character diff
 * JsDiff.diffWords: Word (as defined by \b regex) diff which ignores whitespace
 * JsDiff.diffLines: Line based diff
 *
 * JsDiff.diffCss: Diff targeted at CSS content
 *
 * These methods are based on the implementation proposed in
 * "An O(ND) Difference Algorithm and its Variations" (Myers, 1986).
 * http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.4.6927
 */
var JsDiff = (function() {
  /*jshint maxparams: 5*/
  function clonePath(path) {
    return { newPos: path.newPos, components: path.components.slice(0) };
  }
  function removeEmpty(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  function escapeHTML(s) {
    var n = s;
    n = n.replace(/&/g, '&amp;');
    n = n.replace(/</g, '&lt;');
    n = n.replace(/>/g, '&gt;');
    n = n.replace(/"/g, '&quot;');

    return n;
  }

  var Diff = function(ignoreWhitespace) {
    this.ignoreWhitespace = ignoreWhitespace;
  };
  Diff.prototype = {
      diff: function(oldString, newString) {
        // Handle the identity case (this is due to unrolling editLength == 0
        if (newString === oldString) {
          return [{ value: newString }];
        }
        if (!newString) {
          return [{ value: oldString, removed: true }];
        }
        if (!oldString) {
          return [{ value: newString, added: true }];
        }

        newString = this.tokenize(newString);
        oldString = this.tokenize(oldString);

        var newLen = newString.length, oldLen = oldString.length;
        var maxEditLength = newLen + oldLen;
        var bestPath = [{ newPos: -1, components: [] }];

        // Seed editLength = 0
        var oldPos = this.extractCommon(bestPath[0], newString, oldString, 0);
        if (bestPath[0].newPos+1 >= newLen && oldPos+1 >= oldLen) {
          return bestPath[0].components;
        }

        for (var editLength = 1; editLength <= maxEditLength; editLength++) {
          for (var diagonalPath = -1*editLength; diagonalPath <= editLength; diagonalPath+=2) {
            var basePath;
            var addPath = bestPath[diagonalPath-1],
                removePath = bestPath[diagonalPath+1];
            oldPos = (removePath ? removePath.newPos : 0) - diagonalPath;
            if (addPath) {
              // No one else is going to attempt to use this value, clear it
              bestPath[diagonalPath-1] = undefined;
            }

            var canAdd = addPath && addPath.newPos+1 < newLen;
            var canRemove = removePath && 0 <= oldPos && oldPos < oldLen;
            if (!canAdd && !canRemove) {
              bestPath[diagonalPath] = undefined;
              continue;
            }

            // Select the diagonal that we want to branch from. We select the prior
            // path whose position in the new string is the farthest from the origin
            // and does not pass the bounds of the diff graph
            if (!canAdd || (canRemove && addPath.newPos < removePath.newPos)) {
              basePath = clonePath(removePath);
              this.pushComponent(basePath.components, oldString[oldPos], undefined, true);
            } else {
              basePath = clonePath(addPath);
              basePath.newPos++;
              this.pushComponent(basePath.components, newString[basePath.newPos], true, undefined);
            }

            var oldPos = this.extractCommon(basePath, newString, oldString, diagonalPath);

            if (basePath.newPos+1 >= newLen && oldPos+1 >= oldLen) {
              return basePath.components;
            } else {
              bestPath[diagonalPath] = basePath;
            }
          }
        }
      },

      pushComponent: function(components, value, added, removed) {
        var last = components[components.length-1];
        if (last && last.added === added && last.removed === removed) {
          // We need to clone here as the component clone operation is just
          // as shallow array clone
          components[components.length-1] =
            {value: this.join(last.value, value), added: added, removed: removed };
        } else {
          components.push({value: value, added: added, removed: removed });
        }
      },
      extractCommon: function(basePath, newString, oldString, diagonalPath) {
        var newLen = newString.length,
            oldLen = oldString.length,
            newPos = basePath.newPos,
            oldPos = newPos - diagonalPath;
        while (newPos+1 < newLen && oldPos+1 < oldLen && this.equals(newString[newPos+1], oldString[oldPos+1])) {
          newPos++;
          oldPos++;

          this.pushComponent(basePath.components, newString[newPos], undefined, undefined);
        }
        basePath.newPos = newPos;
        return oldPos;
      },

      equals: function(left, right) {
        var reWhitespace = /\S/;
        if (this.ignoreWhitespace && !reWhitespace.test(left) && !reWhitespace.test(right)) {
          return true;
        } else {
          return left === right;
        }
      },
      join: function(left, right) {
        return left + right;
      },
      tokenize: function(value) {
        return value;
      }
  };

  var CharDiff = new Diff();

  var WordDiff = new Diff(true);
  var WordWithSpaceDiff = new Diff();
  WordDiff.tokenize = WordWithSpaceDiff.tokenize = function(value) {
    return removeEmpty(value.split(/(\s+|\b)/));
  };

  var CssDiff = new Diff(true);
  CssDiff.tokenize = function(value) {
    return removeEmpty(value.split(/([{}:;,]|\s+)/));
  };

  var LineDiff = new Diff();
  LineDiff.tokenize = function(value) {
    var retLines = [],
        lines = value.split(/^/m);

    for(var i = 0; i < lines.length; i++) {
      var line = lines[i],
          lastLine = lines[i - 1];

      // Merge lines that may contain windows new lines
      if (line == '\n' && lastLine && lastLine[lastLine.length - 1] === '\r') {
        retLines[retLines.length - 1] += '\n';
      } else if (line) {
        retLines.push(line);
      }
    }

    return retLines;
  };

  return {
    Diff: Diff,

    diffChars: function(oldStr, newStr) { return CharDiff.diff(oldStr, newStr); },
    diffWords: function(oldStr, newStr) { return WordDiff.diff(oldStr, newStr); },
    diffWordsWithSpace: function(oldStr, newStr) { return WordWithSpaceDiff.diff(oldStr, newStr); },
    diffLines: function(oldStr, newStr) { return LineDiff.diff(oldStr, newStr); },

    diffCss: function(oldStr, newStr) { return CssDiff.diff(oldStr, newStr); },

    createPatch: function(fileName, oldStr, newStr, oldHeader, newHeader) {
      var ret = [];

      ret.push('Index: ' + fileName);
      ret.push('===================================================================');
      ret.push('--- ' + fileName + (typeof oldHeader === 'undefined' ? '' : '\t' + oldHeader));
      ret.push('+++ ' + fileName + (typeof newHeader === 'undefined' ? '' : '\t' + newHeader));

      var diff = LineDiff.diff(oldStr, newStr);
      if (!diff[diff.length-1].value) {
        diff.pop();   // Remove trailing newline add
      }
      diff.push({value: '', lines: []});   // Append an empty value to make cleanup easier

      function contextLines(lines) {
        return lines.map(function(entry) { return ' ' + entry; });
      }
      function eofNL(curRange, i, current) {
        var last = diff[diff.length-2],
            isLast = i === diff.length-2,
            isLastOfType = i === diff.length-3 && (current.added !== last.added || current.removed !== last.removed);

        // Figure out if this is the last line for the given file and missing NL
        if (!/\n$/.test(current.value) && (isLast || isLastOfType)) {
          curRange.push('\\ No newline at end of file');
        }
      }

      var oldRangeStart = 0, newRangeStart = 0, curRange = [],
          oldLine = 1, newLine = 1;
      for (var i = 0; i < diff.length; i++) {
        var current = diff[i],
            lines = current.lines || current.value.replace(/\n$/, '').split('\n');
        current.lines = lines;

        if (current.added || current.removed) {
          if (!oldRangeStart) {
            var prev = diff[i-1];
            oldRangeStart = oldLine;
            newRangeStart = newLine;

            if (prev) {
              curRange = contextLines(prev.lines.slice(-4));
              oldRangeStart -= curRange.length;
              newRangeStart -= curRange.length;
            }
          }
          curRange.push.apply(curRange, lines.map(function(entry) { return (current.added?'+':'-') + entry; }));
          eofNL(curRange, i, current);

          if (current.added) {
            newLine += lines.length;
          } else {
            oldLine += lines.length;
          }
        } else {
          if (oldRangeStart) {
            // Close out any changes that have been output (or join overlapping)
            if (lines.length <= 8 && i < diff.length-2) {
              // Overlapping
              curRange.push.apply(curRange, contextLines(lines));
            } else {
              // end the range and output
              var contextSize = Math.min(lines.length, 4);
              ret.push(
                  '@@ -' + oldRangeStart + ',' + (oldLine-oldRangeStart+contextSize)
                  + ' +' + newRangeStart + ',' + (newLine-newRangeStart+contextSize)
                  + ' @@');
              ret.push.apply(ret, curRange);
              ret.push.apply(ret, contextLines(lines.slice(0, contextSize)));
              if (lines.length <= 4) {
                eofNL(ret, i, current);
              }

              oldRangeStart = 0;  newRangeStart = 0; curRange = [];
            }
          }
          oldLine += lines.length;
          newLine += lines.length;
        }
      }

      return ret.join('\n') + '\n';
    },

    applyPatch: function(oldStr, uniDiff) {
      var diffstr = uniDiff.split('\n');
      var diff = [];
      var remEOFNL = false,
          addEOFNL = false;

      for (var i = (diffstr[0][0]==='I'?4:0); i < diffstr.length; i++) {
        if(diffstr[i][0] === '@') {
          var meh = diffstr[i].split(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
          diff.unshift({
            start:meh[3],
            oldlength:meh[2],
            oldlines:[],
            newlength:meh[4],
            newlines:[]
          });
        } else if(diffstr[i][0] === '+') {
          diff[0].newlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === '-') {
          diff[0].oldlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === ' ') {
          diff[0].newlines.push(diffstr[i].substr(1));
          diff[0].oldlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === '\\') {
          if (diffstr[i-1][0] === '+') {
            remEOFNL = true;
          } else if(diffstr[i-1][0] === '-') {
            addEOFNL = true;
          }
        }
      }

      var str = oldStr.split('\n');
      for (var i = diff.length - 1; i >= 0; i--) {
        var d = diff[i];
        for (var j = 0; j < d.oldlength; j++) {
          if(str[d.start-1+j] !== d.oldlines[j]) {
            return false;
          }
        }
        Array.prototype.splice.apply(str,[d.start-1,+d.oldlength].concat(d.newlines));
      }

      if (remEOFNL) {
        while (!str[str.length-1]) {
          str.pop();
        }
      } else if (addEOFNL) {
        str.push('');
      }
      return str.join('\n');
    },

    convertChangesToXML: function(changes){
      var ret = [];
      for ( var i = 0; i < changes.length; i++) {
        var change = changes[i];
        if (change.added) {
          ret.push('<ins>');
        } else if (change.removed) {
          ret.push('<del>');
        }

        ret.push(escapeHTML(change.value));

        if (change.added) {
          ret.push('</ins>');
        } else if (change.removed) {
          ret.push('</del>');
        }
      }
      return ret.join('');
    },

    // See: http://code.google.com/p/google-diff-match-patch/wiki/API
    convertChangesToDMP: function(changes){
      var ret = [], change;
      for ( var i = 0; i < changes.length; i++) {
        change = changes[i];
        ret.push([(change.added ? 1 : change.removed ? -1 : 0), change.value]);
      }
      return ret;
    }
  };
})();

if (typeof module !== 'undefined') {
    module.exports = JsDiff;
}

},{}],2:[function(require,module,exports){
(function (global){
!function(_e){var e=function(){return _e()["default"]};if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.$=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/api";
var extend = _dereq_('./util').extend;
var api = {},
    apiNodeList = {},
    $ = {};
var array = _dereq_('./array');
var attr = _dereq_('./attr');
var className = _dereq_('./class');
var data = _dereq_('./data');
var dom = _dereq_('./dom');
var dom_extra = _dereq_('./dom_extra');
var event = _dereq_('./event');
var html = _dereq_('./html');
var selector = _dereq_('./selector');
var selector_extra = _dereq_('./selector_extra');
if (selector !== undefined) {
  $ = selector.$;
  $.matches = selector.matches;
  api.find = selector.find;
}
var mode = _dereq_('./mode');
extend($, mode);
var noconflict = _dereq_('./noconflict');
extend($, noconflict);
extend(api, array, attr, className, data, dom, dom_extra, event, html, selector_extra);
extend(apiNodeList, array);
$.version = '0.7.0';
$.extend = extend;
$.fn = api;
$.fnList = apiNodeList;
var $__default = $;
module.exports = {
  default: $__default,
  __esModule: true
};


},{"./array":2,"./attr":3,"./class":4,"./data":5,"./dom":6,"./dom_extra":7,"./event":8,"./html":9,"./mode":11,"./noconflict":12,"./selector":13,"./selector_extra":14,"./util":15}],2:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/array";
var _each = _dereq_('./util').each;
var $__0 = _dereq_('./selector'),
    $ = $__0.$,
    matches = $__0.matches;
var ArrayProto = Array.prototype;
function filter(selector) {
  var callback = typeof selector === 'function' ? selector : function(element) {
    return matches(element, selector);
  };
  return $(ArrayProto.filter.call(this, callback));
}
function each(callback) {
  return _each(this, callback);
}
var forEach = each;
var map = ArrayProto.map;
function reverse() {
  var elements = ArrayProto.slice.call(this);
  return $(ArrayProto.reverse.call(elements));
}
var every = ArrayProto.every;
var some = ArrayProto.some;
var indexOf = ArrayProto.indexOf;
;
module.exports = {
  each: each,
  every: every,
  filter: filter,
  forEach: forEach,
  indexOf: indexOf,
  map: map,
  reverse: reverse,
  some: some,
  __esModule: true
};


},{"./selector":13,"./util":15}],3:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/attr";
var each = _dereq_('./util').each;
function attr(key, value) {
  if (typeof key === 'string' && typeof value === 'undefined') {
    var element = this.nodeType ? this : this[0];
    return element ? element.getAttribute(key) : undefined;
  }
  each(this, function(element) {
    if (typeof key === 'object') {
      for (var attr in key) {
        element.setAttribute(attr, key[attr]);
      }
    } else {
      element.setAttribute(key, value);
    }
  });
  return this;
}
function removeAttr(key) {
  each(this, function(element) {
    element.removeAttribute(key);
  });
  return this;
}
;
module.exports = {
  attr: attr,
  removeAttr: removeAttr,
  __esModule: true
};


},{"./util":15}],4:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/class";
var $__0 = _dereq_('./util'),
    makeIterable = $__0.makeIterable,
    each = $__0.each;
function addClass(value) {
  each(this, function(element) {
    element.classList.add(value);
  });
  return this;
}
function removeClass(value) {
  each(this, function(element) {
    element.classList.remove(value);
  });
  return this;
}
function toggleClass(value) {
  each(this, function(element) {
    element.classList.toggle(value);
  });
  return this;
}
function hasClass(value) {
  return makeIterable(this).some(function(element) {
    return element.classList.contains(value);
  });
}
;
module.exports = {
  addClass: addClass,
  removeClass: removeClass,
  toggleClass: toggleClass,
  hasClass: hasClass,
  __esModule: true
};


},{"./util":15}],5:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/data";
var each = _dereq_('./util').each;
var dataKeyProp = '__domtastic_data__';
function data(key, value) {
  if (typeof key === 'string' && typeof value === 'undefined') {
    var element = this.nodeType ? this : this[0];
    return element && element[dataKeyProp] ? element[dataKeyProp][key] : undefined;
  }
  each(this, function(element) {
    element[dataKeyProp] = element[dataKeyProp] || {};
    element[dataKeyProp][key] = value;
  });
  return this;
}
function prop(key, value) {
  if (typeof key === 'string' && typeof value === 'undefined') {
    var element = this.nodeType ? this : this[0];
    return element && element ? element[key] : undefined;
  }
  each(this, function(element) {
    element[key] = value;
  });
  return this;
}
;
module.exports = {
  data: data,
  prop: prop,
  __esModule: true
};


},{"./util":15}],6:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/dom";
var toArray = _dereq_('./util').toArray;
function append(element) {
  if (this instanceof Node) {
    if (typeof element === 'string') {
      this.insertAdjacentHTML('beforeend', element);
    } else {
      if (element instanceof Node) {
        this.appendChild(element);
      } else {
        var elements = element instanceof NodeList ? toArray(element) : element;
        elements.forEach(this.appendChild.bind(this));
      }
    }
  } else {
    var l = this.length;
    while (l--) {
      var elm = l === 0 ? element : _clone(element);
      append.call(this[l], elm);
    }
  }
  return this;
}
function prepend(element) {
  if (this instanceof Node) {
    if (typeof element === 'string') {
      this.insertAdjacentHTML('afterbegin', element);
    } else {
      if (element instanceof Node) {
        this.insertBefore(element, this.firstChild);
      } else {
        var elements = element instanceof NodeList ? toArray(element) : element;
        elements.reverse().forEach(prepend.bind(this));
      }
    }
  } else {
    var l = this.length;
    while (l--) {
      var elm = l === 0 ? element : _clone(element);
      prepend.call(this[l], elm);
    }
  }
  return this;
}
function before(element) {
  if (this instanceof Node) {
    if (typeof element === 'string') {
      this.insertAdjacentHTML('beforebegin', element);
    } else {
      if (element instanceof Node) {
        this.parentNode.insertBefore(element, this);
      } else {
        var elements = element instanceof NodeList ? toArray(element) : element;
        elements.forEach(before.bind(this));
      }
    }
  } else {
    var l = this.length;
    while (l--) {
      var elm = l === 0 ? element : _clone(element);
      before.call(this[l], elm);
    }
  }
  return this;
}
function after(element) {
  if (this instanceof Node) {
    if (typeof element === 'string') {
      this.insertAdjacentHTML('afterend', element);
    } else {
      if (element instanceof Node) {
        this.parentNode.insertBefore(element, this.nextSibling);
      } else {
        var elements = element instanceof NodeList ? toArray(element) : element;
        elements.reverse().forEach(after.bind(this));
      }
    }
  } else {
    var l = this.length;
    while (l--) {
      var elm = l === 0 ? element : _clone(element);
      after.call(this[l], elm);
    }
  }
  return this;
}
function clone() {
  return $(_clone(this));
}
function _clone(element) {
  if (typeof element === 'string') {
    return element;
  } else if (element instanceof Node) {
    return element.cloneNode(true);
  } else if ('length' in element) {
    return [].map.call(element, function(el) {
      return el.cloneNode(true);
    });
  }
  return element;
}
;
module.exports = {
  append: append,
  prepend: prepend,
  before: before,
  after: after,
  clone: clone,
  __esModule: true
};


},{"./util":15}],7:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/dom_extra";
var each = _dereq_('./util').each;
var $__0 = _dereq_('./dom'),
    append = $__0.append,
    before = $__0.before,
    after = $__0.after;
var $ = _dereq_('./selector').$;
function appendTo(element) {
  var context = typeof element === 'string' ? $(element) : element;
  append.call(context, this);
  return this;
}
function remove() {
  return each(this, function(element) {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });
}
function empty() {
  return each(this, function(element) {
    element.innerHTML = '';
  });
}
function replaceWith() {
  return before.apply(this, arguments).remove();
}
function val(value) {
  if (typeof value !== 'string') {
    return this[0].value;
  }
  each(this, function(element) {
    element.value = value;
  });
  return this;
}
function text(value) {
  if (typeof value !== 'string') {
    return this[0].textContent;
  }
  each(this, function(element) {
    element.textContent = '' + value;
  });
  return this;
}
;
module.exports = {
  appendTo: appendTo,
  remove: remove,
  empty: empty,
  replaceWith: replaceWith,
  val: val,
  text: text,
  __esModule: true
};


},{"./dom":6,"./selector":13,"./util":15}],8:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/event";
var $__0 = _dereq_('./util'),
    global = $__0.global,
    each = $__0.each;
var matches = _dereq_('./selector').matches;
function on(eventName, selector, handler, useCapture) {
  if (typeof selector === 'function') {
    handler = selector;
    selector = null;
  }
  var parts = eventName.split('.');
  eventName = parts[0] || null;
  var namespace = parts[1] || null;
  var eventListener = proxyHandler(handler);
  each(this, function(element) {
    if (selector) {
      eventListener = delegateHandler.bind(element, selector, handler);
    }
    element.addEventListener(eventName, eventListener, useCapture || false);
    getHandlers(element).push({
      eventName: eventName,
      handler: handler,
      eventListener: eventListener,
      selector: selector,
      namespace: namespace
    });
  });
  return this;
}
function off(eventName, selector, handler, useCapture) {
  if (typeof selector === 'function') {
    handler = selector;
    selector = null;
  }
  if (eventName) {
    var parts = eventName.split('.');
    eventName = parts[0];
    var namespace = parts[1];
  }
  each(this, function(element) {
    var handlers = getHandlers(element);
    if (!eventName && !namespace && !selector && !handler) {
      each(handlers, function(item) {
        element.removeEventListener(item.eventName, item.eventListener, useCapture || false);
      });
      clearHandlers(element);
    } else {
      each(handlers.filter(function(item) {
        return ((!eventName || item.eventName === eventName) && (!namespace || item.namespace === namespace) && (!handler || item.handler === handler) && (!selector || item.selector === selector));
      }), function(item) {
        element.removeEventListener(item.eventName, item.eventListener, useCapture || false);
        handlers.splice(handlers.indexOf(item), 1);
      });
      if (handlers.length === 0) {
        clearHandlers(element);
      }
    }
  });
  return this;
}
function delegate(selector, eventName, handler) {
  return on.call(this, eventName, selector, handler);
}
function undelegate(selector, eventName, handler) {
  return off.call(this, eventName, selector, handler);
}
function trigger(type, data) {
  var params = arguments[2] !== (void 0) ? arguments[2] : {};
  params.bubbles = typeof params.bubbles === 'boolean' ? params.bubbles : true;
  params.cancelable = typeof params.cancelable === 'boolean' ? params.cancelable : true;
  params.preventDefault = typeof params.preventDefault === 'boolean' ? params.preventDefault : false;
  params.detail = data;
  var event = new CustomEvent(type, params);
  event._preventDefault = params.preventDefault;
  each(this, function(element) {
    if (!params.bubbles || isEventBubblingInDetachedTree || isAttachedToDocument(element)) {
      element.dispatchEvent(event);
    } else {
      triggerForPath(element, type, params);
    }
  });
  return this;
}
function triggerHandler(type, data) {
  if (this[0]) {
    trigger.call(this[0], type, data, {
      bubbles: false,
      preventDefault: true
    });
  }
}
function ready(handler) {
  if (/complete|loaded|interactive/.test(document.readyState) && document.body) {
    handler();
  } else {
    document.addEventListener('DOMContentLoaded', handler, false);
  }
  return this;
}
function isAttachedToDocument(element) {
  if (element === window || element === document) {
    return true;
  }
  var container = element.ownerDocument.documentElement;
  if (container.contains) {
    return container.contains(element);
  } else if (container.compareDocumentPosition) {
    return !(container.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_DISCONNECTED);
  }
  return false;
}
function triggerForPath(element, type) {
  var params = arguments[2] !== (void 0) ? arguments[2] : {};
  params.bubbles = false;
  var event = new CustomEvent(type, params);
  event._target = element;
  do {
    element.dispatchEvent(event);
  } while (element = element.parentNode);
}
var eventKeyProp = '__domtastic_event__';
var id = 1;
var handlers = {};
var unusedKeys = [];
function getHandlers(element) {
  if (!element[eventKeyProp]) {
    element[eventKeyProp] = unusedKeys.length === 0 ? ++id : unusedKeys.pop();
  }
  var key = element[eventKeyProp];
  return handlers[key] || (handlers[key] = []);
}
function clearHandlers(element) {
  var key = element[eventKeyProp];
  if (handlers[key]) {
    handlers[key] = null;
    element[key] = null;
    unusedKeys.push(key);
  }
}
function proxyHandler(handler) {
  return function(event) {
    handler(augmentEvent(event), event.detail);
  };
}
var augmentEvent = (function() {
  var eventMethods = {
    preventDefault: 'isDefaultPrevented',
    stopImmediatePropagation: 'isImmediatePropagationStopped',
    stopPropagation: 'isPropagationStopped'
  },
      noop = (function() {}),
      returnTrue = (function() {
        return true;
      }),
      returnFalse = (function() {
        return false;
      });
  return function(event) {
    for (var methodName in eventMethods) {
      (function(methodName, testMethodName, originalMethod) {
        event[methodName] = function() {
          this[testMethodName] = returnTrue;
          return originalMethod.apply(this, arguments);
        };
        event[testMethodName] = returnFalse;
      }(methodName, eventMethods[methodName], event[methodName] || noop));
    }
    if (event._preventDefault) {
      event.preventDefault();
    }
    return event;
  };
})();
function delegateHandler(selector, handler, event) {
  var eventTarget = event._target || event.target;
  if (matches(eventTarget, selector)) {
    if (!event.currentTarget) {
      event.currentTarget = eventTarget;
    }
    handler.call(eventTarget, event);
  }
}
(function() {
  function CustomEvent(event) {
    var params = arguments[1] !== (void 0) ? arguments[1] : {
      bubbles: false,
      cancelable: false,
      detail: undefined
    };
    var customEvent = document.createEvent('CustomEvent');
    customEvent.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
    return customEvent;
  }
  CustomEvent.prototype = global.CustomEvent && global.CustomEvent.prototype;
  global.CustomEvent = CustomEvent;
})();
var isEventBubblingInDetachedTree = (function() {
  var isBubbling = false,
      doc = global.document;
  if (doc) {
    var parent = doc.createElement('div'),
        child = parent.cloneNode();
    parent.appendChild(child);
    parent.addEventListener('e', function() {
      isBubbling = true;
    });
    child.dispatchEvent(new CustomEvent('e', {bubbles: true}));
  }
  return isBubbling;
})();
var bind = on,
    unbind = off;
;
module.exports = {
  on: on,
  off: off,
  delegate: delegate,
  undelegate: undelegate,
  trigger: trigger,
  triggerHandler: triggerHandler,
  ready: ready,
  bind: bind,
  unbind: unbind,
  __esModule: true
};


},{"./selector":13,"./util":15}],9:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/html";
var each = _dereq_('./util').each;
function html(fragment) {
  if (typeof fragment !== 'string') {
    var element = this.nodeType ? this : this[0];
    return element ? element.innerHTML : undefined;
  }
  each(this, function(element) {
    element.innerHTML = fragment;
  });
  return this;
}
;
module.exports = {
  html: html,
  __esModule: true
};


},{"./util":15}],10:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/index";
var $ = _dereq_('./api').default;
var $__default = $;
module.exports = {
  default: $__default,
  __esModule: true
};


},{"./api":1}],11:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/mode";
var global = _dereq_('./util').global;
var isNative = false;
function native() {
  var goNative = arguments[0] !== (void 0) ? arguments[0] : true;
  var wasNative = isNative;
  isNative = goNative;
  if (global.$) {
    global.$.isNative = isNative;
  }
  if (!wasNative && isNative) {
    augmentNativePrototypes(this.fn, this.fnList);
  }
  if (wasNative && !isNative) {
    unaugmentNativePrototypes(this.fn, this.fnList);
  }
  return isNative;
}
var NodeProto = typeof Node !== 'undefined' && Node.prototype,
    NodeListProto = typeof NodeList !== 'undefined' && NodeList.prototype;
function augment(obj, key, value) {
  if (!obj.hasOwnProperty(key)) {
    Object.defineProperty(obj, key, {
      value: value,
      configurable: true,
      enumerable: false
    });
  }
}
var unaugment = (function(obj, key) {
  delete obj[key];
});
function augmentNativePrototypes(methodsNode, methodsNodeList) {
  var key;
  for (key in methodsNode) {
    augment(NodeProto, key, methodsNode[key]);
    augment(NodeListProto, key, methodsNode[key]);
  }
  for (key in methodsNodeList) {
    augment(NodeListProto, key, methodsNodeList[key]);
  }
}
function unaugmentNativePrototypes(methodsNode, methodsNodeList) {
  var key;
  for (key in methodsNode) {
    unaugment(NodeProto, key);
    unaugment(NodeListProto, key);
  }
  for (key in methodsNodeList) {
    unaugment(NodeListProto, key);
  }
}
;
module.exports = {
  isNative: isNative,
  native: native,
  __esModule: true
};


},{"./util":15}],12:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/noconflict";
var global = _dereq_('./util').global;
var previousLib = global.$;
function noConflict() {
  global.$ = previousLib;
  return this;
}
;
module.exports = {
  noConflict: noConflict,
  __esModule: true
};


},{"./util":15}],13:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/selector";
var $__0 = _dereq_('./util'),
    global = $__0.global,
    makeIterable = $__0.makeIterable;
var slice = [].slice,
    isPrototypeSet = false,
    reFragment = /^\s*<(\w+|!)[^>]*>/,
    reSingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,
    reSimpleSelector = /^[\.#]?[\w-]*$/;
function $(selector) {
  var context = arguments[1] !== (void 0) ? arguments[1] : document;
  var collection;
  if (!selector) {
    collection = document.querySelectorAll(null);
  } else if (selector instanceof Wrapper) {
    return selector;
  } else if (typeof selector !== 'string') {
    collection = makeIterable(selector);
  } else if (reFragment.test(selector)) {
    collection = createFragment(selector);
  } else {
    context = typeof context === 'string' ? document.querySelector(context) : context.length ? context[0] : context;
    collection = querySelector(selector, context);
  }
  return $.isNative ? collection : wrap(collection);
}
function find(selector) {
  return $(selector, this);
}
var matches = (function() {
  var context = typeof Element !== 'undefined' ? Element.prototype : global,
      _matches = context.matches || context.matchesSelector || context.mozMatchesSelector || context.webkitMatchesSelector || context.msMatchesSelector || context.oMatchesSelector;
  return function(element, selector) {
    return _matches.call(element, selector);
  };
})();
function querySelector(selector, context) {
  var isSimpleSelector = reSimpleSelector.test(selector);
  if (isSimpleSelector && !$.isNative) {
    if (selector[0] === '#') {
      var element = (context.getElementById ? context : document).getElementById(selector.slice(1));
      return element ? [element] : [];
    }
    if (selector[0] === '.') {
      return context.getElementsByClassName(selector.slice(1));
    }
    return context.getElementsByTagName(selector);
  }
  return context.querySelectorAll(selector);
}
function createFragment(html) {
  if (reSingleTag.test(html)) {
    return [document.createElement(RegExp.$1)];
  }
  var elements = [],
      container = document.createElement('div'),
      children = container.childNodes;
  container.innerHTML = html;
  for (var i = 0,
      l = children.length; i < l; i++) {
    elements.push(children[i]);
  }
  return elements;
}
function wrap(collection) {
  if (!isPrototypeSet) {
    Wrapper.prototype = $.fn;
    Wrapper.prototype.constructor = Wrapper;
    isPrototypeSet = true;
  }
  return new Wrapper(collection);
}
function Wrapper(collection) {
  var i = 0,
      length = collection.length;
  for (; i < length; ) {
    this[i] = collection[i++];
  }
  this.length = length;
}
;
module.exports = {
  $: $,
  find: find,
  matches: matches,
  __esModule: true
};


},{"./util":15}],14:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/selector_extra";
var $__0 = _dereq_('./util'),
    each = $__0.each,
    toArray = $__0.toArray;
var $__0 = _dereq_('./selector'),
    $ = $__0.$,
    matches = $__0.matches;
function children(selector) {
  var nodes = [];
  each(this, function(element) {
    if (element.children) {
      each(element.children, function(child) {
        if (!selector || (selector && matches(child, selector))) {
          nodes.push(child);
        }
      });
    }
  });
  return $(nodes);
}
function contents() {
  var nodes = [];
  each(this, function(element) {
    nodes.push.apply(nodes, toArray(element.childNodes));
  });
  return $(nodes);
}
function closest(selector) {
  var node = this[0];
  for (; node.nodeType !== node.DOCUMENT_NODE; node = node.parentNode) {
    if (matches(node, selector)) {
      return $(node);
    }
  }
  return $();
}
function parent(selector) {
  var nodes = [];
  each(this, function(element) {
    if (!selector || (selector && matches(element.parentNode, selector))) {
      nodes.push(element.parentNode);
    }
  });
  return $(nodes);
}
function eq(index) {
  return slice.call(this, index, index + 1);
}
function get(index) {
  return this[index];
}
function slice(start, end) {
  return $([].slice.apply(this, arguments));
}
;
module.exports = {
  children: children,
  contents: contents,
  closest: closest,
  parent: parent,
  eq: eq,
  get: get,
  slice: slice,
  __esModule: true
};


},{"./selector":13,"./util":15}],15:[function(_dereq_,module,exports){
"use strict";
var __moduleName = "src/util";
var global = new Function("return this")(),
    slice = Array.prototype.slice;
var toArray = (function(collection) {
  return slice.call(collection);
});
var makeIterable = (function(element) {
  return element.nodeType || element === window ? [element] : element;
});
function each(collection, callback) {
  var length = collection.length;
  if (length !== undefined && collection.nodeType === undefined) {
    for (var i = 0; i < length; i++) {
      callback(collection[i], i, collection);
    }
  } else {
    callback(collection, 0, collection);
  }
  return collection;
}
function extend(target) {
  for (var sources = [],
      $__0 = 1; $__0 < arguments.length; $__0++)
    sources[$__0 - 1] = arguments[$__0];
  sources.forEach(function(src) {
    if (src) {
      for (var prop in src) {
        target[prop] = src[prop];
      }
    }
  });
  return target;
}
;
module.exports = {
  global: global,
  toArray: toArray,
  makeIterable: makeIterable,
  each: each,
  extend: extend,
  __esModule: true
};


},{}]},{},[10])
(10)
});

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
var obj     = require('./modules/obj')
,   events  = require('./modules/events')
,   content = require('./modules/content');

content.init();
obj.init();
events();


},{"./modules/content":4,"./modules/events":6,"./modules/obj":7}],4:[function(require,module,exports){
'use strict';

var $ = window.jQuery || require('domtastic');

var $body      = $('body'),
    isOriginal = true;

var content = {

  init: function() {
    return this.wrapContent();
  },

  wrapContent: function() {
    $body.html('<div id="nice-content">' + $body.html() + '</div>');
    this.originalHTML = this.currentHTML = this.getHTML();
    return this.makeEditable($body);
  },

  makeEditable: function(el) {
    return el.attr('contenteditable', true);
  },

  removeNice: function() {
    $body
      .html($('#nice-content').html())
      .removeAttr('contenteditable');
  },

  getHTML: function() {
    var html = $('#nice-content').html();
    return html
            .trim()
            .replace(/>\s+</g, '><')
            .replace(/></g, '>\n\n<')
            .replace(/^<iframe.+\/iframe>/g, '')
            .replace(/^<object.+\/object>/g, '')
            .replace(/^<noscript.+\/noscript>/g, '')
            .replace(/<script.+\/script>/g, '');
  },

  setHTML: function(html) {
    return $('#nice-content').html(html);
  },

  toggleHTML: function() {

    isOriginal = this.getHTML() === this.originalHTML ? true : false;

    if (!isOriginal) {
      this.currentHTML = this.getHTML();
    }

    var html = isOriginal ? this.currentHTML : this.originalHTML;

    this.setHTML(html);

  },

  getSelection: function() {
    var range;
    if (document.selection) {
      range = document.body.createTextRange();
      range.moveToElementText(document.getElementById('nice-pre'));
      range.select();
    } else if (window.getSelection) {
      range = document.createRange();
      range.selectNode(document.getElementById('nice-pre'));
      window.getSelection().addRange(range);
    }

  },

  originalHTML: '',

  currentHTML: ''

};

module.exports = content;

},{"domtastic":2}],5:[function(require,module,exports){
'use strict';

var $ = window.jQuey || require('domtastic')
,   jsdiff = require('diff')
,   content = require('./content');

var diffObj = {

  init: function() {
    var diff = jsdiff.diffLines(content.originalHTML, content.getHTML());
    this.populateDiff(diff);
  },

  populateDiff: function(diff) {
    var $pre = $('#nice-pre').html('')
    ,   color
    ,   klass
    ,   span;


    diff.forEach(function(part) {
      if (part.added || part.removed) {
        color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        klass = part.added ? 'is-added' : part.removed ? 'is-removed' : '';
        span = document.createElement('span');
        span.style.color = color;
        span.setAttribute('class', klass);
        span.appendChild(document.createTextNode(part.value));
        $pre.append(span);
      }
    });
  }
};


module.exports = diffObj;

},{"./content":4,"diff":1,"domtastic":2}],6:[function(require,module,exports){
'use strict';

var $       = window.jQuery || require('domtastic')
,   diff    = require('./diff')
,   content = require('./content');

var events = function() {

  $('#nice-min').on('click', function(e) {
    e.preventDefault();
    $('#nice-obj').toggleClass('is-min');
  });

  $('#nice-off').on('click', function(e) {
    e.preventDefault();
    content.removeNice();
  });

  $('#nice-diff').on('click', function(e) {
    e.preventDefault();
    $('#nice-pre').toggleClass('is-active');
    diff.init();
  });

  $('#nice-toggle').on('click', function(e) {
    e.preventDefault();
    content.toggleHTML();
  });

  $('#nice-pre').on('click', function(e) {
    e.preventDefault();
    content.getSelection();
  });

  $('#nice-nav li')
    .on('mouseover', function(e) {
      var $title = $('#nice-title');
      $title.text($(e.srcElement).attr('data-text'));
    }).on('mouseleave', function(e) {
      var $title = $('#nice-title');
      $title.text($title.attr('data-text'));
    });

};

module.exports = events;

},{"./content":4,"./diff":5,"domtastic":2}],7:[function(require,module,exports){
'use strict';

var objTemplate = require('./template');

var body = document.getElementsByTagName('body')[ 0 ];
var head = document.getElementsByTagName('head')[ 0 ];

var nav = {

  init: function() {
    this.createObj();
  },

  createObj: function() {
    var div = document.createElement('div');
    div.setAttribute('id', 'nice-obj');
    div.setAttribute('contenteditable', false);
    div.setAttribute('class', 'is-min');
    div.innerHTML = objTemplate;
    this.style(div);
  },

  style: function(div) {
    var link = document.createElement('link');
    link.setAttribute('rel','stylesheet');
    link.setAttribute('href','https://seethroughtrees.github.io/inline-copy-editor/index.css');
    link.setAttribute('type','text/css');
    head.appendChild(link);
    this.append(div);
  },

  append: function(div) {
    body.appendChild(div);
  }

};

module.exports = nav;

},{"./template":8}],8:[function(require,module,exports){
'use strict';

// set objTemplate
var objTemplate = '<ul id="nice-nav">';
    objTemplate += '<li id="nice-title" data-text="NICE" title="Go To Homepage">NICE</li>';
    objTemplate += '<li id="nice-min" data-text="HIDE" title="Minimize NICE"><span>\uE001</span></li>';
    objTemplate += '<li id="nice-off" data-text="OFF" title="Turn off NICE">\uE003</li>';
    objTemplate += '<li id="nice-diff" data-text="DIFF" title="See Diff">\uE002</li>';
    objTemplate += '<li id="nice-toggle" data-text="TOGGLE" title="Toggle Original">\uE004</li>';
    objTemplate += '</ul>';
    objTemplate += '<pre id="nice-pre"></pre>';

module.exports = objTemplate;

},{}]},{},[3])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVm9sdW1lcy9TZXNzaW9ucy93ZWIvZGV2L2NvcHktZWRpdG9yL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVm9sdW1lcy9TZXNzaW9ucy93ZWIvZGV2L2NvcHktZWRpdG9yL25vZGVfbW9kdWxlcy9kaWZmL2RpZmYuanMiLCIvVm9sdW1lcy9TZXNzaW9ucy93ZWIvZGV2L2NvcHktZWRpdG9yL25vZGVfbW9kdWxlcy9kb210YXN0aWMvZG9tdGFzdGljLmpzIiwiL1ZvbHVtZXMvU2Vzc2lvbnMvd2ViL2Rldi9jb3B5LWVkaXRvci9zcmMvanMvaW5kZXguanMiLCIvVm9sdW1lcy9TZXNzaW9ucy93ZWIvZGV2L2NvcHktZWRpdG9yL3NyYy9qcy9tb2R1bGVzL2NvbnRlbnQuanMiLCIvVm9sdW1lcy9TZXNzaW9ucy93ZWIvZGV2L2NvcHktZWRpdG9yL3NyYy9qcy9tb2R1bGVzL2RpZmYuanMiLCIvVm9sdW1lcy9TZXNzaW9ucy93ZWIvZGV2L2NvcHktZWRpdG9yL3NyYy9qcy9tb2R1bGVzL2V2ZW50cy5qcyIsIi9Wb2x1bWVzL1Nlc3Npb25zL3dlYi9kZXYvY29weS1lZGl0b3Ivc3JjL2pzL21vZHVsZXMvb2JqLmpzIiwiL1ZvbHVtZXMvU2Vzc2lvbnMvd2ViL2Rldi9jb3B5LWVkaXRvci9zcmMvanMvbW9kdWxlcy90ZW1wbGF0ZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3NEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIFNlZSBMSUNFTlNFIGZpbGUgZm9yIHRlcm1zIG9mIHVzZSAqL1xuXG4vKlxuICogVGV4dCBkaWZmIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIFRoaXMgbGlicmFyeSBzdXBwb3J0cyB0aGUgZm9sbG93aW5nIEFQSVM6XG4gKiBKc0RpZmYuZGlmZkNoYXJzOiBDaGFyYWN0ZXIgYnkgY2hhcmFjdGVyIGRpZmZcbiAqIEpzRGlmZi5kaWZmV29yZHM6IFdvcmQgKGFzIGRlZmluZWQgYnkgXFxiIHJlZ2V4KSBkaWZmIHdoaWNoIGlnbm9yZXMgd2hpdGVzcGFjZVxuICogSnNEaWZmLmRpZmZMaW5lczogTGluZSBiYXNlZCBkaWZmXG4gKlxuICogSnNEaWZmLmRpZmZDc3M6IERpZmYgdGFyZ2V0ZWQgYXQgQ1NTIGNvbnRlbnRcbiAqXG4gKiBUaGVzZSBtZXRob2RzIGFyZSBiYXNlZCBvbiB0aGUgaW1wbGVtZW50YXRpb24gcHJvcG9zZWQgaW5cbiAqIFwiQW4gTyhORCkgRGlmZmVyZW5jZSBBbGdvcml0aG0gYW5kIGl0cyBWYXJpYXRpb25zXCIgKE15ZXJzLCAxOTg2KS5cbiAqIGh0dHA6Ly9jaXRlc2VlcnguaXN0LnBzdS5lZHUvdmlld2RvYy9zdW1tYXJ5P2RvaT0xMC4xLjEuNC42OTI3XG4gKi9cbnZhciBKc0RpZmYgPSAoZnVuY3Rpb24oKSB7XG4gIC8qanNoaW50IG1heHBhcmFtczogNSovXG4gIGZ1bmN0aW9uIGNsb25lUGF0aChwYXRoKSB7XG4gICAgcmV0dXJuIHsgbmV3UG9zOiBwYXRoLm5ld1BvcywgY29tcG9uZW50czogcGF0aC5jb21wb25lbnRzLnNsaWNlKDApIH07XG4gIH1cbiAgZnVuY3Rpb24gcmVtb3ZlRW1wdHkoYXJyYXkpIHtcbiAgICB2YXIgcmV0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFycmF5W2ldKSB7XG4gICAgICAgIHJldC5wdXNoKGFycmF5W2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuICBmdW5jdGlvbiBlc2NhcGVIVE1MKHMpIHtcbiAgICB2YXIgbiA9IHM7XG4gICAgbiA9IG4ucmVwbGFjZSgvJi9nLCAnJmFtcDsnKTtcbiAgICBuID0gbi5yZXBsYWNlKC88L2csICcmbHQ7Jyk7XG4gICAgbiA9IG4ucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xuICAgIG4gPSBuLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcblxuICAgIHJldHVybiBuO1xuICB9XG5cbiAgdmFyIERpZmYgPSBmdW5jdGlvbihpZ25vcmVXaGl0ZXNwYWNlKSB7XG4gICAgdGhpcy5pZ25vcmVXaGl0ZXNwYWNlID0gaWdub3JlV2hpdGVzcGFjZTtcbiAgfTtcbiAgRGlmZi5wcm90b3R5cGUgPSB7XG4gICAgICBkaWZmOiBmdW5jdGlvbihvbGRTdHJpbmcsIG5ld1N0cmluZykge1xuICAgICAgICAvLyBIYW5kbGUgdGhlIGlkZW50aXR5IGNhc2UgKHRoaXMgaXMgZHVlIHRvIHVucm9sbGluZyBlZGl0TGVuZ3RoID09IDBcbiAgICAgICAgaWYgKG5ld1N0cmluZyA9PT0gb2xkU3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIFt7IHZhbHVlOiBuZXdTdHJpbmcgfV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFuZXdTdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gW3sgdmFsdWU6IG9sZFN0cmluZywgcmVtb3ZlZDogdHJ1ZSB9XTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW9sZFN0cmluZykge1xuICAgICAgICAgIHJldHVybiBbeyB2YWx1ZTogbmV3U3RyaW5nLCBhZGRlZDogdHJ1ZSB9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ld1N0cmluZyA9IHRoaXMudG9rZW5pemUobmV3U3RyaW5nKTtcbiAgICAgICAgb2xkU3RyaW5nID0gdGhpcy50b2tlbml6ZShvbGRTdHJpbmcpO1xuXG4gICAgICAgIHZhciBuZXdMZW4gPSBuZXdTdHJpbmcubGVuZ3RoLCBvbGRMZW4gPSBvbGRTdHJpbmcubGVuZ3RoO1xuICAgICAgICB2YXIgbWF4RWRpdExlbmd0aCA9IG5ld0xlbiArIG9sZExlbjtcbiAgICAgICAgdmFyIGJlc3RQYXRoID0gW3sgbmV3UG9zOiAtMSwgY29tcG9uZW50czogW10gfV07XG5cbiAgICAgICAgLy8gU2VlZCBlZGl0TGVuZ3RoID0gMFxuICAgICAgICB2YXIgb2xkUG9zID0gdGhpcy5leHRyYWN0Q29tbW9uKGJlc3RQYXRoWzBdLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgMCk7XG4gICAgICAgIGlmIChiZXN0UGF0aFswXS5uZXdQb3MrMSA+PSBuZXdMZW4gJiYgb2xkUG9zKzEgPj0gb2xkTGVuKSB7XG4gICAgICAgICAgcmV0dXJuIGJlc3RQYXRoWzBdLmNvbXBvbmVudHM7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBlZGl0TGVuZ3RoID0gMTsgZWRpdExlbmd0aCA8PSBtYXhFZGl0TGVuZ3RoOyBlZGl0TGVuZ3RoKyspIHtcbiAgICAgICAgICBmb3IgKHZhciBkaWFnb25hbFBhdGggPSAtMSplZGl0TGVuZ3RoOyBkaWFnb25hbFBhdGggPD0gZWRpdExlbmd0aDsgZGlhZ29uYWxQYXRoKz0yKSB7XG4gICAgICAgICAgICB2YXIgYmFzZVBhdGg7XG4gICAgICAgICAgICB2YXIgYWRkUGF0aCA9IGJlc3RQYXRoW2RpYWdvbmFsUGF0aC0xXSxcbiAgICAgICAgICAgICAgICByZW1vdmVQYXRoID0gYmVzdFBhdGhbZGlhZ29uYWxQYXRoKzFdO1xuICAgICAgICAgICAgb2xkUG9zID0gKHJlbW92ZVBhdGggPyByZW1vdmVQYXRoLm5ld1BvcyA6IDApIC0gZGlhZ29uYWxQYXRoO1xuICAgICAgICAgICAgaWYgKGFkZFBhdGgpIHtcbiAgICAgICAgICAgICAgLy8gTm8gb25lIGVsc2UgaXMgZ29pbmcgdG8gYXR0ZW1wdCB0byB1c2UgdGhpcyB2YWx1ZSwgY2xlYXIgaXRcbiAgICAgICAgICAgICAgYmVzdFBhdGhbZGlhZ29uYWxQYXRoLTFdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY2FuQWRkID0gYWRkUGF0aCAmJiBhZGRQYXRoLm5ld1BvcysxIDwgbmV3TGVuO1xuICAgICAgICAgICAgdmFyIGNhblJlbW92ZSA9IHJlbW92ZVBhdGggJiYgMCA8PSBvbGRQb3MgJiYgb2xkUG9zIDwgb2xkTGVuO1xuICAgICAgICAgICAgaWYgKCFjYW5BZGQgJiYgIWNhblJlbW92ZSkge1xuICAgICAgICAgICAgICBiZXN0UGF0aFtkaWFnb25hbFBhdGhdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSBkaWFnb25hbCB0aGF0IHdlIHdhbnQgdG8gYnJhbmNoIGZyb20uIFdlIHNlbGVjdCB0aGUgcHJpb3JcbiAgICAgICAgICAgIC8vIHBhdGggd2hvc2UgcG9zaXRpb24gaW4gdGhlIG5ldyBzdHJpbmcgaXMgdGhlIGZhcnRoZXN0IGZyb20gdGhlIG9yaWdpblxuICAgICAgICAgICAgLy8gYW5kIGRvZXMgbm90IHBhc3MgdGhlIGJvdW5kcyBvZiB0aGUgZGlmZiBncmFwaFxuICAgICAgICAgICAgaWYgKCFjYW5BZGQgfHwgKGNhblJlbW92ZSAmJiBhZGRQYXRoLm5ld1BvcyA8IHJlbW92ZVBhdGgubmV3UG9zKSkge1xuICAgICAgICAgICAgICBiYXNlUGF0aCA9IGNsb25lUGF0aChyZW1vdmVQYXRoKTtcbiAgICAgICAgICAgICAgdGhpcy5wdXNoQ29tcG9uZW50KGJhc2VQYXRoLmNvbXBvbmVudHMsIG9sZFN0cmluZ1tvbGRQb3NdLCB1bmRlZmluZWQsIHRydWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYmFzZVBhdGggPSBjbG9uZVBhdGgoYWRkUGF0aCk7XG4gICAgICAgICAgICAgIGJhc2VQYXRoLm5ld1BvcysrO1xuICAgICAgICAgICAgICB0aGlzLnB1c2hDb21wb25lbnQoYmFzZVBhdGguY29tcG9uZW50cywgbmV3U3RyaW5nW2Jhc2VQYXRoLm5ld1Bvc10sIHRydWUsIHVuZGVmaW5lZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBvbGRQb3MgPSB0aGlzLmV4dHJhY3RDb21tb24oYmFzZVBhdGgsIG5ld1N0cmluZywgb2xkU3RyaW5nLCBkaWFnb25hbFBhdGgpO1xuXG4gICAgICAgICAgICBpZiAoYmFzZVBhdGgubmV3UG9zKzEgPj0gbmV3TGVuICYmIG9sZFBvcysxID49IG9sZExlbikge1xuICAgICAgICAgICAgICByZXR1cm4gYmFzZVBhdGguY29tcG9uZW50cztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJlc3RQYXRoW2RpYWdvbmFsUGF0aF0gPSBiYXNlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIHB1c2hDb21wb25lbnQ6IGZ1bmN0aW9uKGNvbXBvbmVudHMsIHZhbHVlLCBhZGRlZCwgcmVtb3ZlZCkge1xuICAgICAgICB2YXIgbGFzdCA9IGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGgtMV07XG4gICAgICAgIGlmIChsYXN0ICYmIGxhc3QuYWRkZWQgPT09IGFkZGVkICYmIGxhc3QucmVtb3ZlZCA9PT0gcmVtb3ZlZCkge1xuICAgICAgICAgIC8vIFdlIG5lZWQgdG8gY2xvbmUgaGVyZSBhcyB0aGUgY29tcG9uZW50IGNsb25lIG9wZXJhdGlvbiBpcyBqdXN0XG4gICAgICAgICAgLy8gYXMgc2hhbGxvdyBhcnJheSBjbG9uZVxuICAgICAgICAgIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGgtMV0gPVxuICAgICAgICAgICAge3ZhbHVlOiB0aGlzLmpvaW4obGFzdC52YWx1ZSwgdmFsdWUpLCBhZGRlZDogYWRkZWQsIHJlbW92ZWQ6IHJlbW92ZWQgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb21wb25lbnRzLnB1c2goe3ZhbHVlOiB2YWx1ZSwgYWRkZWQ6IGFkZGVkLCByZW1vdmVkOiByZW1vdmVkIH0pO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZXh0cmFjdENvbW1vbjogZnVuY3Rpb24oYmFzZVBhdGgsIG5ld1N0cmluZywgb2xkU3RyaW5nLCBkaWFnb25hbFBhdGgpIHtcbiAgICAgICAgdmFyIG5ld0xlbiA9IG5ld1N0cmluZy5sZW5ndGgsXG4gICAgICAgICAgICBvbGRMZW4gPSBvbGRTdHJpbmcubGVuZ3RoLFxuICAgICAgICAgICAgbmV3UG9zID0gYmFzZVBhdGgubmV3UG9zLFxuICAgICAgICAgICAgb2xkUG9zID0gbmV3UG9zIC0gZGlhZ29uYWxQYXRoO1xuICAgICAgICB3aGlsZSAobmV3UG9zKzEgPCBuZXdMZW4gJiYgb2xkUG9zKzEgPCBvbGRMZW4gJiYgdGhpcy5lcXVhbHMobmV3U3RyaW5nW25ld1BvcysxXSwgb2xkU3RyaW5nW29sZFBvcysxXSkpIHtcbiAgICAgICAgICBuZXdQb3MrKztcbiAgICAgICAgICBvbGRQb3MrKztcblxuICAgICAgICAgIHRoaXMucHVzaENvbXBvbmVudChiYXNlUGF0aC5jb21wb25lbnRzLCBuZXdTdHJpbmdbbmV3UG9zXSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIGJhc2VQYXRoLm5ld1BvcyA9IG5ld1BvcztcbiAgICAgICAgcmV0dXJuIG9sZFBvcztcbiAgICAgIH0sXG5cbiAgICAgIGVxdWFsczogZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIHJlV2hpdGVzcGFjZSA9IC9cXFMvO1xuICAgICAgICBpZiAodGhpcy5pZ25vcmVXaGl0ZXNwYWNlICYmICFyZVdoaXRlc3BhY2UudGVzdChsZWZ0KSAmJiAhcmVXaGl0ZXNwYWNlLnRlc3QocmlnaHQpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGxlZnQgPT09IHJpZ2h0O1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgam9pbjogZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgcmV0dXJuIGxlZnQgKyByaWdodDtcbiAgICAgIH0sXG4gICAgICB0b2tlbml6ZTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICB9O1xuXG4gIHZhciBDaGFyRGlmZiA9IG5ldyBEaWZmKCk7XG5cbiAgdmFyIFdvcmREaWZmID0gbmV3IERpZmYodHJ1ZSk7XG4gIHZhciBXb3JkV2l0aFNwYWNlRGlmZiA9IG5ldyBEaWZmKCk7XG4gIFdvcmREaWZmLnRva2VuaXplID0gV29yZFdpdGhTcGFjZURpZmYudG9rZW5pemUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiByZW1vdmVFbXB0eSh2YWx1ZS5zcGxpdCgvKFxccyt8XFxiKS8pKTtcbiAgfTtcblxuICB2YXIgQ3NzRGlmZiA9IG5ldyBEaWZmKHRydWUpO1xuICBDc3NEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gcmVtb3ZlRW1wdHkodmFsdWUuc3BsaXQoLyhbe306OyxdfFxccyspLykpO1xuICB9O1xuXG4gIHZhciBMaW5lRGlmZiA9IG5ldyBEaWZmKCk7XG4gIExpbmVEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB2YXIgcmV0TGluZXMgPSBbXSxcbiAgICAgICAgbGluZXMgPSB2YWx1ZS5zcGxpdCgvXi9tKTtcblxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGxpbmUgPSBsaW5lc1tpXSxcbiAgICAgICAgICBsYXN0TGluZSA9IGxpbmVzW2kgLSAxXTtcblxuICAgICAgLy8gTWVyZ2UgbGluZXMgdGhhdCBtYXkgY29udGFpbiB3aW5kb3dzIG5ldyBsaW5lc1xuICAgICAgaWYgKGxpbmUgPT0gJ1xcbicgJiYgbGFzdExpbmUgJiYgbGFzdExpbmVbbGFzdExpbmUubGVuZ3RoIC0gMV0gPT09ICdcXHInKSB7XG4gICAgICAgIHJldExpbmVzW3JldExpbmVzLmxlbmd0aCAtIDFdICs9ICdcXG4nO1xuICAgICAgfSBlbHNlIGlmIChsaW5lKSB7XG4gICAgICAgIHJldExpbmVzLnB1c2gobGluZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJldExpbmVzO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgRGlmZjogRGlmZixcblxuICAgIGRpZmZDaGFyczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIENoYXJEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZXb3JkczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIFdvcmREaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZXb3Jkc1dpdGhTcGFjZTogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIFdvcmRXaXRoU3BhY2VEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZMaW5lczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIExpbmVEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuXG4gICAgZGlmZkNzczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIENzc0RpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG5cbiAgICBjcmVhdGVQYXRjaDogZnVuY3Rpb24oZmlsZU5hbWUsIG9sZFN0ciwgbmV3U3RyLCBvbGRIZWFkZXIsIG5ld0hlYWRlcikge1xuICAgICAgdmFyIHJldCA9IFtdO1xuXG4gICAgICByZXQucHVzaCgnSW5kZXg6ICcgKyBmaWxlTmFtZSk7XG4gICAgICByZXQucHVzaCgnPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PScpO1xuICAgICAgcmV0LnB1c2goJy0tLSAnICsgZmlsZU5hbWUgKyAodHlwZW9mIG9sZEhlYWRlciA9PT0gJ3VuZGVmaW5lZCcgPyAnJyA6ICdcXHQnICsgb2xkSGVhZGVyKSk7XG4gICAgICByZXQucHVzaCgnKysrICcgKyBmaWxlTmFtZSArICh0eXBlb2YgbmV3SGVhZGVyID09PSAndW5kZWZpbmVkJyA/ICcnIDogJ1xcdCcgKyBuZXdIZWFkZXIpKTtcblxuICAgICAgdmFyIGRpZmYgPSBMaW5lRGlmZi5kaWZmKG9sZFN0ciwgbmV3U3RyKTtcbiAgICAgIGlmICghZGlmZltkaWZmLmxlbmd0aC0xXS52YWx1ZSkge1xuICAgICAgICBkaWZmLnBvcCgpOyAgIC8vIFJlbW92ZSB0cmFpbGluZyBuZXdsaW5lIGFkZFxuICAgICAgfVxuICAgICAgZGlmZi5wdXNoKHt2YWx1ZTogJycsIGxpbmVzOiBbXX0pOyAgIC8vIEFwcGVuZCBhbiBlbXB0eSB2YWx1ZSB0byBtYWtlIGNsZWFudXAgZWFzaWVyXG5cbiAgICAgIGZ1bmN0aW9uIGNvbnRleHRMaW5lcyhsaW5lcykge1xuICAgICAgICByZXR1cm4gbGluZXMubWFwKGZ1bmN0aW9uKGVudHJ5KSB7IHJldHVybiAnICcgKyBlbnRyeTsgfSk7XG4gICAgICB9XG4gICAgICBmdW5jdGlvbiBlb2ZOTChjdXJSYW5nZSwgaSwgY3VycmVudCkge1xuICAgICAgICB2YXIgbGFzdCA9IGRpZmZbZGlmZi5sZW5ndGgtMl0sXG4gICAgICAgICAgICBpc0xhc3QgPSBpID09PSBkaWZmLmxlbmd0aC0yLFxuICAgICAgICAgICAgaXNMYXN0T2ZUeXBlID0gaSA9PT0gZGlmZi5sZW5ndGgtMyAmJiAoY3VycmVudC5hZGRlZCAhPT0gbGFzdC5hZGRlZCB8fCBjdXJyZW50LnJlbW92ZWQgIT09IGxhc3QucmVtb3ZlZCk7XG5cbiAgICAgICAgLy8gRmlndXJlIG91dCBpZiB0aGlzIGlzIHRoZSBsYXN0IGxpbmUgZm9yIHRoZSBnaXZlbiBmaWxlIGFuZCBtaXNzaW5nIE5MXG4gICAgICAgIGlmICghL1xcbiQvLnRlc3QoY3VycmVudC52YWx1ZSkgJiYgKGlzTGFzdCB8fCBpc0xhc3RPZlR5cGUpKSB7XG4gICAgICAgICAgY3VyUmFuZ2UucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIG9sZFJhbmdlU3RhcnQgPSAwLCBuZXdSYW5nZVN0YXJ0ID0gMCwgY3VyUmFuZ2UgPSBbXSxcbiAgICAgICAgICBvbGRMaW5lID0gMSwgbmV3TGluZSA9IDE7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRpZmYubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGN1cnJlbnQgPSBkaWZmW2ldLFxuICAgICAgICAgICAgbGluZXMgPSBjdXJyZW50LmxpbmVzIHx8IGN1cnJlbnQudmFsdWUucmVwbGFjZSgvXFxuJC8sICcnKS5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGN1cnJlbnQubGluZXMgPSBsaW5lcztcblxuICAgICAgICBpZiAoY3VycmVudC5hZGRlZCB8fCBjdXJyZW50LnJlbW92ZWQpIHtcbiAgICAgICAgICBpZiAoIW9sZFJhbmdlU3RhcnQpIHtcbiAgICAgICAgICAgIHZhciBwcmV2ID0gZGlmZltpLTFdO1xuICAgICAgICAgICAgb2xkUmFuZ2VTdGFydCA9IG9sZExpbmU7XG4gICAgICAgICAgICBuZXdSYW5nZVN0YXJ0ID0gbmV3TGluZTtcblxuICAgICAgICAgICAgaWYgKHByZXYpIHtcbiAgICAgICAgICAgICAgY3VyUmFuZ2UgPSBjb250ZXh0TGluZXMocHJldi5saW5lcy5zbGljZSgtNCkpO1xuICAgICAgICAgICAgICBvbGRSYW5nZVN0YXJ0IC09IGN1clJhbmdlLmxlbmd0aDtcbiAgICAgICAgICAgICAgbmV3UmFuZ2VTdGFydCAtPSBjdXJSYW5nZS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1clJhbmdlLnB1c2guYXBwbHkoY3VyUmFuZ2UsIGxpbmVzLm1hcChmdW5jdGlvbihlbnRyeSkgeyByZXR1cm4gKGN1cnJlbnQuYWRkZWQ/JysnOictJykgKyBlbnRyeTsgfSkpO1xuICAgICAgICAgIGVvZk5MKGN1clJhbmdlLCBpLCBjdXJyZW50KTtcblxuICAgICAgICAgIGlmIChjdXJyZW50LmFkZGVkKSB7XG4gICAgICAgICAgICBuZXdMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb2xkTGluZSArPSBsaW5lcy5sZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChvbGRSYW5nZVN0YXJ0KSB7XG4gICAgICAgICAgICAvLyBDbG9zZSBvdXQgYW55IGNoYW5nZXMgdGhhdCBoYXZlIGJlZW4gb3V0cHV0IChvciBqb2luIG92ZXJsYXBwaW5nKVxuICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA8PSA4ICYmIGkgPCBkaWZmLmxlbmd0aC0yKSB7XG4gICAgICAgICAgICAgIC8vIE92ZXJsYXBwaW5nXG4gICAgICAgICAgICAgIGN1clJhbmdlLnB1c2guYXBwbHkoY3VyUmFuZ2UsIGNvbnRleHRMaW5lcyhsaW5lcykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gZW5kIHRoZSByYW5nZSBhbmQgb3V0cHV0XG4gICAgICAgICAgICAgIHZhciBjb250ZXh0U2l6ZSA9IE1hdGgubWluKGxpbmVzLmxlbmd0aCwgNCk7XG4gICAgICAgICAgICAgIHJldC5wdXNoKFxuICAgICAgICAgICAgICAgICAgJ0BAIC0nICsgb2xkUmFuZ2VTdGFydCArICcsJyArIChvbGRMaW5lLW9sZFJhbmdlU3RhcnQrY29udGV4dFNpemUpXG4gICAgICAgICAgICAgICAgICArICcgKycgKyBuZXdSYW5nZVN0YXJ0ICsgJywnICsgKG5ld0xpbmUtbmV3UmFuZ2VTdGFydCtjb250ZXh0U2l6ZSlcbiAgICAgICAgICAgICAgICAgICsgJyBAQCcpO1xuICAgICAgICAgICAgICByZXQucHVzaC5hcHBseShyZXQsIGN1clJhbmdlKTtcbiAgICAgICAgICAgICAgcmV0LnB1c2guYXBwbHkocmV0LCBjb250ZXh0TGluZXMobGluZXMuc2xpY2UoMCwgY29udGV4dFNpemUpKSk7XG4gICAgICAgICAgICAgIGlmIChsaW5lcy5sZW5ndGggPD0gNCkge1xuICAgICAgICAgICAgICAgIGVvZk5MKHJldCwgaSwgY3VycmVudCk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBvbGRSYW5nZVN0YXJ0ID0gMDsgIG5ld1JhbmdlU3RhcnQgPSAwOyBjdXJSYW5nZSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICBuZXdMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmV0LmpvaW4oJ1xcbicpICsgJ1xcbic7XG4gICAgfSxcblxuICAgIGFwcGx5UGF0Y2g6IGZ1bmN0aW9uKG9sZFN0ciwgdW5pRGlmZikge1xuICAgICAgdmFyIGRpZmZzdHIgPSB1bmlEaWZmLnNwbGl0KCdcXG4nKTtcbiAgICAgIHZhciBkaWZmID0gW107XG4gICAgICB2YXIgcmVtRU9GTkwgPSBmYWxzZSxcbiAgICAgICAgICBhZGRFT0ZOTCA9IGZhbHNlO1xuXG4gICAgICBmb3IgKHZhciBpID0gKGRpZmZzdHJbMF1bMF09PT0nSSc/NDowKTsgaSA8IGRpZmZzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYoZGlmZnN0cltpXVswXSA9PT0gJ0AnKSB7XG4gICAgICAgICAgdmFyIG1laCA9IGRpZmZzdHJbaV0uc3BsaXQoL0BAIC0oXFxkKyksKFxcZCspIFxcKyhcXGQrKSwoXFxkKykgQEAvKTtcbiAgICAgICAgICBkaWZmLnVuc2hpZnQoe1xuICAgICAgICAgICAgc3RhcnQ6bWVoWzNdLFxuICAgICAgICAgICAgb2xkbGVuZ3RoOm1laFsyXSxcbiAgICAgICAgICAgIG9sZGxpbmVzOltdLFxuICAgICAgICAgICAgbmV3bGVuZ3RoOm1laFs0XSxcbiAgICAgICAgICAgIG5ld2xpbmVzOltdXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ldWzBdID09PSAnKycpIHtcbiAgICAgICAgICBkaWZmWzBdLm5ld2xpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJy0nKSB7XG4gICAgICAgICAgZGlmZlswXS5vbGRsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICcgJykge1xuICAgICAgICAgIGRpZmZbMF0ubmV3bGluZXMucHVzaChkaWZmc3RyW2ldLnN1YnN0cigxKSk7XG4gICAgICAgICAgZGlmZlswXS5vbGRsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICdcXFxcJykge1xuICAgICAgICAgIGlmIChkaWZmc3RyW2ktMV1bMF0gPT09ICcrJykge1xuICAgICAgICAgICAgcmVtRU9GTkwgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ktMV1bMF0gPT09ICctJykge1xuICAgICAgICAgICAgYWRkRU9GTkwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgc3RyID0gb2xkU3RyLnNwbGl0KCdcXG4nKTtcbiAgICAgIGZvciAodmFyIGkgPSBkaWZmLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIHZhciBkID0gZGlmZltpXTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBkLm9sZGxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgaWYoc3RyW2Quc3RhcnQtMStqXSAhPT0gZC5vbGRsaW5lc1tqXSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBBcnJheS5wcm90b3R5cGUuc3BsaWNlLmFwcGx5KHN0cixbZC5zdGFydC0xLCtkLm9sZGxlbmd0aF0uY29uY2F0KGQubmV3bGluZXMpKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlbUVPRk5MKSB7XG4gICAgICAgIHdoaWxlICghc3RyW3N0ci5sZW5ndGgtMV0pIHtcbiAgICAgICAgICBzdHIucG9wKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYWRkRU9GTkwpIHtcbiAgICAgICAgc3RyLnB1c2goJycpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0ci5qb2luKCdcXG4nKTtcbiAgICB9LFxuXG4gICAgY29udmVydENoYW5nZXNUb1hNTDogZnVuY3Rpb24oY2hhbmdlcyl7XG4gICAgICB2YXIgcmV0ID0gW107XG4gICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgICBpZiAoY2hhbmdlLmFkZGVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzxpbnM+Jyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2hhbmdlLnJlbW92ZWQpIHtcbiAgICAgICAgICByZXQucHVzaCgnPGRlbD4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldC5wdXNoKGVzY2FwZUhUTUwoY2hhbmdlLnZhbHVlKSk7XG5cbiAgICAgICAgaWYgKGNoYW5nZS5hZGRlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8L2lucz4nKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGFuZ2UucmVtb3ZlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8L2RlbD4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldC5qb2luKCcnKTtcbiAgICB9LFxuXG4gICAgLy8gU2VlOiBodHRwOi8vY29kZS5nb29nbGUuY29tL3AvZ29vZ2xlLWRpZmYtbWF0Y2gtcGF0Y2gvd2lraS9BUElcbiAgICBjb252ZXJ0Q2hhbmdlc1RvRE1QOiBmdW5jdGlvbihjaGFuZ2VzKXtcbiAgICAgIHZhciByZXQgPSBbXSwgY2hhbmdlO1xuICAgICAgZm9yICggdmFyIGkgPSAwOyBpIDwgY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgICByZXQucHVzaChbKGNoYW5nZS5hZGRlZCA/IDEgOiBjaGFuZ2UucmVtb3ZlZCA/IC0xIDogMCksIGNoYW5nZS52YWx1ZV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH07XG59KSgpO1xuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEpzRGlmZjtcbn1cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbiFmdW5jdGlvbihfZSl7dmFyIGU9ZnVuY3Rpb24oKXtyZXR1cm4gX2UoKVtcImRlZmF1bHRcIl19O2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgZjtcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P2Y9d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/Zj1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihmPXNlbGYpLGYuJD1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblwidXNlIHN0cmljdFwiO1xudmFyIF9fbW9kdWxlTmFtZSA9IFwic3JjL2FwaVwiO1xudmFyIGV4dGVuZCA9IF9kZXJlcV8oJy4vdXRpbCcpLmV4dGVuZDtcbnZhciBhcGkgPSB7fSxcbiAgICBhcGlOb2RlTGlzdCA9IHt9LFxuICAgICQgPSB7fTtcbnZhciBhcnJheSA9IF9kZXJlcV8oJy4vYXJyYXknKTtcbnZhciBhdHRyID0gX2RlcmVxXygnLi9hdHRyJyk7XG52YXIgY2xhc3NOYW1lID0gX2RlcmVxXygnLi9jbGFzcycpO1xudmFyIGRhdGEgPSBfZGVyZXFfKCcuL2RhdGEnKTtcbnZhciBkb20gPSBfZGVyZXFfKCcuL2RvbScpO1xudmFyIGRvbV9leHRyYSA9IF9kZXJlcV8oJy4vZG9tX2V4dHJhJyk7XG52YXIgZXZlbnQgPSBfZGVyZXFfKCcuL2V2ZW50Jyk7XG52YXIgaHRtbCA9IF9kZXJlcV8oJy4vaHRtbCcpO1xudmFyIHNlbGVjdG9yID0gX2RlcmVxXygnLi9zZWxlY3RvcicpO1xudmFyIHNlbGVjdG9yX2V4dHJhID0gX2RlcmVxXygnLi9zZWxlY3Rvcl9leHRyYScpO1xuaWYgKHNlbGVjdG9yICE9PSB1bmRlZmluZWQpIHtcbiAgJCA9IHNlbGVjdG9yLiQ7XG4gICQubWF0Y2hlcyA9IHNlbGVjdG9yLm1hdGNoZXM7XG4gIGFwaS5maW5kID0gc2VsZWN0b3IuZmluZDtcbn1cbnZhciBtb2RlID0gX2RlcmVxXygnLi9tb2RlJyk7XG5leHRlbmQoJCwgbW9kZSk7XG52YXIgbm9jb25mbGljdCA9IF9kZXJlcV8oJy4vbm9jb25mbGljdCcpO1xuZXh0ZW5kKCQsIG5vY29uZmxpY3QpO1xuZXh0ZW5kKGFwaSwgYXJyYXksIGF0dHIsIGNsYXNzTmFtZSwgZGF0YSwgZG9tLCBkb21fZXh0cmEsIGV2ZW50LCBodG1sLCBzZWxlY3Rvcl9leHRyYSk7XG5leHRlbmQoYXBpTm9kZUxpc3QsIGFycmF5KTtcbiQudmVyc2lvbiA9ICcwLjcuMCc7XG4kLmV4dGVuZCA9IGV4dGVuZDtcbiQuZm4gPSBhcGk7XG4kLmZuTGlzdCA9IGFwaU5vZGVMaXN0O1xudmFyICRfX2RlZmF1bHQgPSAkO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmF1bHQ6ICRfX2RlZmF1bHQsXG4gIF9fZXNNb2R1bGU6IHRydWVcbn07XG5cblxufSx7XCIuL2FycmF5XCI6MixcIi4vYXR0clwiOjMsXCIuL2NsYXNzXCI6NCxcIi4vZGF0YVwiOjUsXCIuL2RvbVwiOjYsXCIuL2RvbV9leHRyYVwiOjcsXCIuL2V2ZW50XCI6OCxcIi4vaHRtbFwiOjksXCIuL21vZGVcIjoxMSxcIi4vbm9jb25mbGljdFwiOjEyLFwiLi9zZWxlY3RvclwiOjEzLFwiLi9zZWxlY3Rvcl9leHRyYVwiOjE0LFwiLi91dGlsXCI6MTV9XSwyOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblwidXNlIHN0cmljdFwiO1xudmFyIF9fbW9kdWxlTmFtZSA9IFwic3JjL2FycmF5XCI7XG52YXIgX2VhY2ggPSBfZGVyZXFfKCcuL3V0aWwnKS5lYWNoO1xudmFyICRfXzAgPSBfZGVyZXFfKCcuL3NlbGVjdG9yJyksXG4gICAgJCA9ICRfXzAuJCxcbiAgICBtYXRjaGVzID0gJF9fMC5tYXRjaGVzO1xudmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGU7XG5mdW5jdGlvbiBmaWx0ZXIoc2VsZWN0b3IpIHtcbiAgdmFyIGNhbGxiYWNrID0gdHlwZW9mIHNlbGVjdG9yID09PSAnZnVuY3Rpb24nID8gc2VsZWN0b3IgOiBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgcmV0dXJuIG1hdGNoZXMoZWxlbWVudCwgc2VsZWN0b3IpO1xuICB9O1xuICByZXR1cm4gJChBcnJheVByb3RvLmZpbHRlci5jYWxsKHRoaXMsIGNhbGxiYWNrKSk7XG59XG5mdW5jdGlvbiBlYWNoKGNhbGxiYWNrKSB7XG4gIHJldHVybiBfZWFjaCh0aGlzLCBjYWxsYmFjayk7XG59XG52YXIgZm9yRWFjaCA9IGVhY2g7XG52YXIgbWFwID0gQXJyYXlQcm90by5tYXA7XG5mdW5jdGlvbiByZXZlcnNlKCkge1xuICB2YXIgZWxlbWVudHMgPSBBcnJheVByb3RvLnNsaWNlLmNhbGwodGhpcyk7XG4gIHJldHVybiAkKEFycmF5UHJvdG8ucmV2ZXJzZS5jYWxsKGVsZW1lbnRzKSk7XG59XG52YXIgZXZlcnkgPSBBcnJheVByb3RvLmV2ZXJ5O1xudmFyIHNvbWUgPSBBcnJheVByb3RvLnNvbWU7XG52YXIgaW5kZXhPZiA9IEFycmF5UHJvdG8uaW5kZXhPZjtcbjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBlYWNoOiBlYWNoLFxuICBldmVyeTogZXZlcnksXG4gIGZpbHRlcjogZmlsdGVyLFxuICBmb3JFYWNoOiBmb3JFYWNoLFxuICBpbmRleE9mOiBpbmRleE9mLFxuICBtYXA6IG1hcCxcbiAgcmV2ZXJzZTogcmV2ZXJzZSxcbiAgc29tZTogc29tZSxcbiAgX19lc01vZHVsZTogdHJ1ZVxufTtcblxuXG59LHtcIi4vc2VsZWN0b3JcIjoxMyxcIi4vdXRpbFwiOjE1fV0sMzpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy9hdHRyXCI7XG52YXIgZWFjaCA9IF9kZXJlcV8oJy4vdXRpbCcpLmVhY2g7XG5mdW5jdGlvbiBhdHRyKGtleSwgdmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgZWxlbWVudCA9IHRoaXMubm9kZVR5cGUgPyB0aGlzIDogdGhpc1swXTtcbiAgICByZXR1cm4gZWxlbWVudCA/IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGtleSkgOiB1bmRlZmluZWQ7XG4gIH1cbiAgZWFjaCh0aGlzLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKHR5cGVvZiBrZXkgPT09ICdvYmplY3QnKSB7XG4gICAgICBmb3IgKHZhciBhdHRyIGluIGtleSkge1xuICAgICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShhdHRyLCBrZXlbYXR0cl0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShrZXksIHZhbHVlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIHJlbW92ZUF0dHIoa2V5KSB7XG4gIGVhY2godGhpcywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKGtleSk7XG4gIH0pO1xuICByZXR1cm4gdGhpcztcbn1cbjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRyOiBhdHRyLFxuICByZW1vdmVBdHRyOiByZW1vdmVBdHRyLFxuICBfX2VzTW9kdWxlOiB0cnVlXG59O1xuXG5cbn0se1wiLi91dGlsXCI6MTV9XSw0OltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblwidXNlIHN0cmljdFwiO1xudmFyIF9fbW9kdWxlTmFtZSA9IFwic3JjL2NsYXNzXCI7XG52YXIgJF9fMCA9IF9kZXJlcV8oJy4vdXRpbCcpLFxuICAgIG1ha2VJdGVyYWJsZSA9ICRfXzAubWFrZUl0ZXJhYmxlLFxuICAgIGVhY2ggPSAkX18wLmVhY2g7XG5mdW5jdGlvbiBhZGRDbGFzcyh2YWx1ZSkge1xuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50LmNsYXNzTGlzdC5hZGQodmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG5mdW5jdGlvbiByZW1vdmVDbGFzcyh2YWx1ZSkge1xuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUodmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG5mdW5jdGlvbiB0b2dnbGVDbGFzcyh2YWx1ZSkge1xuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUodmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG5mdW5jdGlvbiBoYXNDbGFzcyh2YWx1ZSkge1xuICByZXR1cm4gbWFrZUl0ZXJhYmxlKHRoaXMpLnNvbWUoZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIHJldHVybiBlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucyh2YWx1ZSk7XG4gIH0pO1xufVxuO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZENsYXNzOiBhZGRDbGFzcyxcbiAgcmVtb3ZlQ2xhc3M6IHJlbW92ZUNsYXNzLFxuICB0b2dnbGVDbGFzczogdG9nZ2xlQ2xhc3MsXG4gIGhhc0NsYXNzOiBoYXNDbGFzcyxcbiAgX19lc01vZHVsZTogdHJ1ZVxufTtcblxuXG59LHtcIi4vdXRpbFwiOjE1fV0sNTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy9kYXRhXCI7XG52YXIgZWFjaCA9IF9kZXJlcV8oJy4vdXRpbCcpLmVhY2g7XG52YXIgZGF0YUtleVByb3AgPSAnX19kb210YXN0aWNfZGF0YV9fJztcbmZ1bmN0aW9uIGRhdGEoa2V5LCB2YWx1ZSkge1xuICBpZiAodHlwZW9mIGtleSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgIHZhciBlbGVtZW50ID0gdGhpcy5ub2RlVHlwZSA/IHRoaXMgOiB0aGlzWzBdO1xuICAgIHJldHVybiBlbGVtZW50ICYmIGVsZW1lbnRbZGF0YUtleVByb3BdID8gZWxlbWVudFtkYXRhS2V5UHJvcF1ba2V5XSA6IHVuZGVmaW5lZDtcbiAgfVxuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50W2RhdGFLZXlQcm9wXSA9IGVsZW1lbnRbZGF0YUtleVByb3BdIHx8IHt9O1xuICAgIGVsZW1lbnRbZGF0YUtleVByb3BdW2tleV0gPSB2YWx1ZTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufVxuZnVuY3Rpb24gcHJvcChrZXksIHZhbHVlKSB7XG4gIGlmICh0eXBlb2Yga2V5ID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgdmFyIGVsZW1lbnQgPSB0aGlzLm5vZGVUeXBlID8gdGhpcyA6IHRoaXNbMF07XG4gICAgcmV0dXJuIGVsZW1lbnQgJiYgZWxlbWVudCA/IGVsZW1lbnRba2V5XSA6IHVuZGVmaW5lZDtcbiAgfVxuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50W2tleV0gPSB2YWx1ZTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufVxuO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRhdGE6IGRhdGEsXG4gIHByb3A6IHByb3AsXG4gIF9fZXNNb2R1bGU6IHRydWVcbn07XG5cblxufSx7XCIuL3V0aWxcIjoxNX1dLDY6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXCJ1c2Ugc3RyaWN0XCI7XG52YXIgX19tb2R1bGVOYW1lID0gXCJzcmMvZG9tXCI7XG52YXIgdG9BcnJheSA9IF9kZXJlcV8oJy4vdXRpbCcpLnRvQXJyYXk7XG5mdW5jdGlvbiBhcHBlbmQoZWxlbWVudCkge1xuICBpZiAodGhpcyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICBpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0aGlzLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgZWxlbWVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgTm9kZSkge1xuICAgICAgICB0aGlzLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gZWxlbWVudCBpbnN0YW5jZW9mIE5vZGVMaXN0ID8gdG9BcnJheShlbGVtZW50KSA6IGVsZW1lbnQ7XG4gICAgICAgIGVsZW1lbnRzLmZvckVhY2godGhpcy5hcHBlbmRDaGlsZC5iaW5kKHRoaXMpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGwgPSB0aGlzLmxlbmd0aDtcbiAgICB3aGlsZSAobC0tKSB7XG4gICAgICB2YXIgZWxtID0gbCA9PT0gMCA/IGVsZW1lbnQgOiBfY2xvbmUoZWxlbWVudCk7XG4gICAgICBhcHBlbmQuY2FsbCh0aGlzW2xdLCBlbG0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIHByZXBlbmQoZWxlbWVudCkge1xuICBpZiAodGhpcyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICBpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0aGlzLmluc2VydEFkamFjZW50SFRNTCgnYWZ0ZXJiZWdpbicsIGVsZW1lbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgdGhpcy5pbnNlcnRCZWZvcmUoZWxlbWVudCwgdGhpcy5maXJzdENoaWxkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBlbGVtZW50cyA9IGVsZW1lbnQgaW5zdGFuY2VvZiBOb2RlTGlzdCA/IHRvQXJyYXkoZWxlbWVudCkgOiBlbGVtZW50O1xuICAgICAgICBlbGVtZW50cy5yZXZlcnNlKCkuZm9yRWFjaChwcmVwZW5kLmJpbmQodGhpcykpO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgbCA9IHRoaXMubGVuZ3RoO1xuICAgIHdoaWxlIChsLS0pIHtcbiAgICAgIHZhciBlbG0gPSBsID09PSAwID8gZWxlbWVudCA6IF9jbG9uZShlbGVtZW50KTtcbiAgICAgIHByZXBlbmQuY2FsbCh0aGlzW2xdLCBlbG0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIGJlZm9yZShlbGVtZW50KSB7XG4gIGlmICh0aGlzIGluc3RhbmNlb2YgTm9kZSkge1xuICAgIGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHRoaXMuaW5zZXJ0QWRqYWNlbnRIVE1MKCdiZWZvcmViZWdpbicsIGVsZW1lbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgdGhpcy5wYXJlbnROb2RlLmluc2VydEJlZm9yZShlbGVtZW50LCB0aGlzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBlbGVtZW50cyA9IGVsZW1lbnQgaW5zdGFuY2VvZiBOb2RlTGlzdCA/IHRvQXJyYXkoZWxlbWVudCkgOiBlbGVtZW50O1xuICAgICAgICBlbGVtZW50cy5mb3JFYWNoKGJlZm9yZS5iaW5kKHRoaXMpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGwgPSB0aGlzLmxlbmd0aDtcbiAgICB3aGlsZSAobC0tKSB7XG4gICAgICB2YXIgZWxtID0gbCA9PT0gMCA/IGVsZW1lbnQgOiBfY2xvbmUoZWxlbWVudCk7XG4gICAgICBiZWZvcmUuY2FsbCh0aGlzW2xdLCBlbG0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIGFmdGVyKGVsZW1lbnQpIHtcbiAgaWYgKHRoaXMgaW5zdGFuY2VvZiBOb2RlKSB7XG4gICAgaWYgKHR5cGVvZiBlbGVtZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgdGhpcy5pbnNlcnRBZGphY2VudEhUTUwoJ2FmdGVyZW5kJywgZWxlbWVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgTm9kZSkge1xuICAgICAgICB0aGlzLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGVsZW1lbnQsIHRoaXMubmV4dFNpYmxpbmcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGVsZW1lbnRzID0gZWxlbWVudCBpbnN0YW5jZW9mIE5vZGVMaXN0ID8gdG9BcnJheShlbGVtZW50KSA6IGVsZW1lbnQ7XG4gICAgICAgIGVsZW1lbnRzLnJldmVyc2UoKS5mb3JFYWNoKGFmdGVyLmJpbmQodGhpcykpO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgbCA9IHRoaXMubGVuZ3RoO1xuICAgIHdoaWxlIChsLS0pIHtcbiAgICAgIHZhciBlbG0gPSBsID09PSAwID8gZWxlbWVudCA6IF9jbG9uZShlbGVtZW50KTtcbiAgICAgIGFmdGVyLmNhbGwodGhpc1tsXSwgZWxtKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59XG5mdW5jdGlvbiBjbG9uZSgpIHtcbiAgcmV0dXJuICQoX2Nsb25lKHRoaXMpKTtcbn1cbmZ1bmN0aW9uIF9jbG9uZShlbGVtZW50KSB7XG4gIGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZWxlbWVudDtcbiAgfSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgTm9kZSkge1xuICAgIHJldHVybiBlbGVtZW50LmNsb25lTm9kZSh0cnVlKTtcbiAgfSBlbHNlIGlmICgnbGVuZ3RoJyBpbiBlbGVtZW50KSB7XG4gICAgcmV0dXJuIFtdLm1hcC5jYWxsKGVsZW1lbnQsIGZ1bmN0aW9uKGVsKSB7XG4gICAgICByZXR1cm4gZWwuY2xvbmVOb2RlKHRydWUpO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBlbGVtZW50O1xufVxuO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFwcGVuZDogYXBwZW5kLFxuICBwcmVwZW5kOiBwcmVwZW5kLFxuICBiZWZvcmU6IGJlZm9yZSxcbiAgYWZ0ZXI6IGFmdGVyLFxuICBjbG9uZTogY2xvbmUsXG4gIF9fZXNNb2R1bGU6IHRydWVcbn07XG5cblxufSx7XCIuL3V0aWxcIjoxNX1dLDc6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXCJ1c2Ugc3RyaWN0XCI7XG52YXIgX19tb2R1bGVOYW1lID0gXCJzcmMvZG9tX2V4dHJhXCI7XG52YXIgZWFjaCA9IF9kZXJlcV8oJy4vdXRpbCcpLmVhY2g7XG52YXIgJF9fMCA9IF9kZXJlcV8oJy4vZG9tJyksXG4gICAgYXBwZW5kID0gJF9fMC5hcHBlbmQsXG4gICAgYmVmb3JlID0gJF9fMC5iZWZvcmUsXG4gICAgYWZ0ZXIgPSAkX18wLmFmdGVyO1xudmFyICQgPSBfZGVyZXFfKCcuL3NlbGVjdG9yJykuJDtcbmZ1bmN0aW9uIGFwcGVuZFRvKGVsZW1lbnQpIHtcbiAgdmFyIGNvbnRleHQgPSB0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycgPyAkKGVsZW1lbnQpIDogZWxlbWVudDtcbiAgYXBwZW5kLmNhbGwoY29udGV4dCwgdGhpcyk7XG4gIHJldHVybiB0aGlzO1xufVxuZnVuY3Rpb24gcmVtb3ZlKCkge1xuICByZXR1cm4gZWFjaCh0aGlzLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKGVsZW1lbnQucGFyZW50Tm9kZSkge1xuICAgICAgZWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsZW1lbnQpO1xuICAgIH1cbiAgfSk7XG59XG5mdW5jdGlvbiBlbXB0eSgpIHtcbiAgcmV0dXJuIGVhY2godGhpcywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gJyc7XG4gIH0pO1xufVxuZnVuY3Rpb24gcmVwbGFjZVdpdGgoKSB7XG4gIHJldHVybiBiZWZvcmUuYXBwbHkodGhpcywgYXJndW1lbnRzKS5yZW1vdmUoKTtcbn1cbmZ1bmN0aW9uIHZhbCh2YWx1ZSkge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0aGlzWzBdLnZhbHVlO1xuICB9XG4gIGVhY2godGhpcywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIGVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufVxuZnVuY3Rpb24gdGV4dCh2YWx1ZSkge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0aGlzWzBdLnRleHRDb250ZW50O1xuICB9XG4gIGVhY2godGhpcywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIGVsZW1lbnQudGV4dENvbnRlbnQgPSAnJyArIHZhbHVlO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG47XG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXBwZW5kVG86IGFwcGVuZFRvLFxuICByZW1vdmU6IHJlbW92ZSxcbiAgZW1wdHk6IGVtcHR5LFxuICByZXBsYWNlV2l0aDogcmVwbGFjZVdpdGgsXG4gIHZhbDogdmFsLFxuICB0ZXh0OiB0ZXh0LFxuICBfX2VzTW9kdWxlOiB0cnVlXG59O1xuXG5cbn0se1wiLi9kb21cIjo2LFwiLi9zZWxlY3RvclwiOjEzLFwiLi91dGlsXCI6MTV9XSw4OltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblwidXNlIHN0cmljdFwiO1xudmFyIF9fbW9kdWxlTmFtZSA9IFwic3JjL2V2ZW50XCI7XG52YXIgJF9fMCA9IF9kZXJlcV8oJy4vdXRpbCcpLFxuICAgIGdsb2JhbCA9ICRfXzAuZ2xvYmFsLFxuICAgIGVhY2ggPSAkX18wLmVhY2g7XG52YXIgbWF0Y2hlcyA9IF9kZXJlcV8oJy4vc2VsZWN0b3InKS5tYXRjaGVzO1xuZnVuY3Rpb24gb24oZXZlbnROYW1lLCBzZWxlY3RvciwgaGFuZGxlciwgdXNlQ2FwdHVyZSkge1xuICBpZiAodHlwZW9mIHNlbGVjdG9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgaGFuZGxlciA9IHNlbGVjdG9yO1xuICAgIHNlbGVjdG9yID0gbnVsbDtcbiAgfVxuICB2YXIgcGFydHMgPSBldmVudE5hbWUuc3BsaXQoJy4nKTtcbiAgZXZlbnROYW1lID0gcGFydHNbMF0gfHwgbnVsbDtcbiAgdmFyIG5hbWVzcGFjZSA9IHBhcnRzWzFdIHx8IG51bGw7XG4gIHZhciBldmVudExpc3RlbmVyID0gcHJveHlIYW5kbGVyKGhhbmRsZXIpO1xuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoc2VsZWN0b3IpIHtcbiAgICAgIGV2ZW50TGlzdGVuZXIgPSBkZWxlZ2F0ZUhhbmRsZXIuYmluZChlbGVtZW50LCBzZWxlY3RvciwgaGFuZGxlcik7XG4gICAgfVxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGV2ZW50TGlzdGVuZXIsIHVzZUNhcHR1cmUgfHwgZmFsc2UpO1xuICAgIGdldEhhbmRsZXJzKGVsZW1lbnQpLnB1c2goe1xuICAgICAgZXZlbnROYW1lOiBldmVudE5hbWUsXG4gICAgICBoYW5kbGVyOiBoYW5kbGVyLFxuICAgICAgZXZlbnRMaXN0ZW5lcjogZXZlbnRMaXN0ZW5lcixcbiAgICAgIHNlbGVjdG9yOiBzZWxlY3RvcixcbiAgICAgIG5hbWVzcGFjZTogbmFtZXNwYWNlXG4gICAgfSk7XG4gIH0pO1xuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIG9mZihldmVudE5hbWUsIHNlbGVjdG9yLCBoYW5kbGVyLCB1c2VDYXB0dXJlKSB7XG4gIGlmICh0eXBlb2Ygc2VsZWN0b3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICBoYW5kbGVyID0gc2VsZWN0b3I7XG4gICAgc2VsZWN0b3IgPSBudWxsO1xuICB9XG4gIGlmIChldmVudE5hbWUpIHtcbiAgICB2YXIgcGFydHMgPSBldmVudE5hbWUuc3BsaXQoJy4nKTtcbiAgICBldmVudE5hbWUgPSBwYXJ0c1swXTtcbiAgICB2YXIgbmFtZXNwYWNlID0gcGFydHNbMV07XG4gIH1cbiAgZWFjaCh0aGlzLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgdmFyIGhhbmRsZXJzID0gZ2V0SGFuZGxlcnMoZWxlbWVudCk7XG4gICAgaWYgKCFldmVudE5hbWUgJiYgIW5hbWVzcGFjZSAmJiAhc2VsZWN0b3IgJiYgIWhhbmRsZXIpIHtcbiAgICAgIGVhY2goaGFuZGxlcnMsIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGl0ZW0uZXZlbnROYW1lLCBpdGVtLmV2ZW50TGlzdGVuZXIsIHVzZUNhcHR1cmUgfHwgZmFsc2UpO1xuICAgICAgfSk7XG4gICAgICBjbGVhckhhbmRsZXJzKGVsZW1lbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBlYWNoKGhhbmRsZXJzLmZpbHRlcihmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgIHJldHVybiAoKCFldmVudE5hbWUgfHwgaXRlbS5ldmVudE5hbWUgPT09IGV2ZW50TmFtZSkgJiYgKCFuYW1lc3BhY2UgfHwgaXRlbS5uYW1lc3BhY2UgPT09IG5hbWVzcGFjZSkgJiYgKCFoYW5kbGVyIHx8IGl0ZW0uaGFuZGxlciA9PT0gaGFuZGxlcikgJiYgKCFzZWxlY3RvciB8fCBpdGVtLnNlbGVjdG9yID09PSBzZWxlY3RvcikpO1xuICAgICAgfSksIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGl0ZW0uZXZlbnROYW1lLCBpdGVtLmV2ZW50TGlzdGVuZXIsIHVzZUNhcHR1cmUgfHwgZmFsc2UpO1xuICAgICAgICBoYW5kbGVycy5zcGxpY2UoaGFuZGxlcnMuaW5kZXhPZihpdGVtKSwgMSk7XG4gICAgICB9KTtcbiAgICAgIGlmIChoYW5kbGVycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY2xlYXJIYW5kbGVycyhlbGVtZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIGRlbGVnYXRlKHNlbGVjdG9yLCBldmVudE5hbWUsIGhhbmRsZXIpIHtcbiAgcmV0dXJuIG9uLmNhbGwodGhpcywgZXZlbnROYW1lLCBzZWxlY3RvciwgaGFuZGxlcik7XG59XG5mdW5jdGlvbiB1bmRlbGVnYXRlKHNlbGVjdG9yLCBldmVudE5hbWUsIGhhbmRsZXIpIHtcbiAgcmV0dXJuIG9mZi5jYWxsKHRoaXMsIGV2ZW50TmFtZSwgc2VsZWN0b3IsIGhhbmRsZXIpO1xufVxuZnVuY3Rpb24gdHJpZ2dlcih0eXBlLCBkYXRhKSB7XG4gIHZhciBwYXJhbXMgPSBhcmd1bWVudHNbMl0gIT09ICh2b2lkIDApID8gYXJndW1lbnRzWzJdIDoge307XG4gIHBhcmFtcy5idWJibGVzID0gdHlwZW9mIHBhcmFtcy5idWJibGVzID09PSAnYm9vbGVhbicgPyBwYXJhbXMuYnViYmxlcyA6IHRydWU7XG4gIHBhcmFtcy5jYW5jZWxhYmxlID0gdHlwZW9mIHBhcmFtcy5jYW5jZWxhYmxlID09PSAnYm9vbGVhbicgPyBwYXJhbXMuY2FuY2VsYWJsZSA6IHRydWU7XG4gIHBhcmFtcy5wcmV2ZW50RGVmYXVsdCA9IHR5cGVvZiBwYXJhbXMucHJldmVudERlZmF1bHQgPT09ICdib29sZWFuJyA/IHBhcmFtcy5wcmV2ZW50RGVmYXVsdCA6IGZhbHNlO1xuICBwYXJhbXMuZGV0YWlsID0gZGF0YTtcbiAgdmFyIGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KHR5cGUsIHBhcmFtcyk7XG4gIGV2ZW50Ll9wcmV2ZW50RGVmYXVsdCA9IHBhcmFtcy5wcmV2ZW50RGVmYXVsdDtcbiAgZWFjaCh0aGlzLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKCFwYXJhbXMuYnViYmxlcyB8fCBpc0V2ZW50QnViYmxpbmdJbkRldGFjaGVkVHJlZSB8fCBpc0F0dGFjaGVkVG9Eb2N1bWVudChlbGVtZW50KSkge1xuICAgICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJpZ2dlckZvclBhdGgoZWxlbWVudCwgdHlwZSwgcGFyYW1zKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIHRyaWdnZXJIYW5kbGVyKHR5cGUsIGRhdGEpIHtcbiAgaWYgKHRoaXNbMF0pIHtcbiAgICB0cmlnZ2VyLmNhbGwodGhpc1swXSwgdHlwZSwgZGF0YSwge1xuICAgICAgYnViYmxlczogZmFsc2UsXG4gICAgICBwcmV2ZW50RGVmYXVsdDogdHJ1ZVxuICAgIH0pO1xuICB9XG59XG5mdW5jdGlvbiByZWFkeShoYW5kbGVyKSB7XG4gIGlmICgvY29tcGxldGV8bG9hZGVkfGludGVyYWN0aXZlLy50ZXN0KGRvY3VtZW50LnJlYWR5U3RhdGUpICYmIGRvY3VtZW50LmJvZHkpIHtcbiAgICBoYW5kbGVyKCk7XG4gIH0gZWxzZSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGhhbmRsZXIsIGZhbHNlKTtcbiAgfVxuICByZXR1cm4gdGhpcztcbn1cbmZ1bmN0aW9uIGlzQXR0YWNoZWRUb0RvY3VtZW50KGVsZW1lbnQpIHtcbiAgaWYgKGVsZW1lbnQgPT09IHdpbmRvdyB8fCBlbGVtZW50ID09PSBkb2N1bWVudCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHZhciBjb250YWluZXIgPSBlbGVtZW50Lm93bmVyRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICBpZiAoY29udGFpbmVyLmNvbnRhaW5zKSB7XG4gICAgcmV0dXJuIGNvbnRhaW5lci5jb250YWlucyhlbGVtZW50KTtcbiAgfSBlbHNlIGlmIChjb250YWluZXIuY29tcGFyZURvY3VtZW50UG9zaXRpb24pIHtcbiAgICByZXR1cm4gIShjb250YWluZXIuY29tcGFyZURvY3VtZW50UG9zaXRpb24oZWxlbWVudCkgJiBOb2RlLkRPQ1VNRU5UX1BPU0lUSU9OX0RJU0NPTk5FQ1RFRCk7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gdHJpZ2dlckZvclBhdGgoZWxlbWVudCwgdHlwZSkge1xuICB2YXIgcGFyYW1zID0gYXJndW1lbnRzWzJdICE9PSAodm9pZCAwKSA/IGFyZ3VtZW50c1syXSA6IHt9O1xuICBwYXJhbXMuYnViYmxlcyA9IGZhbHNlO1xuICB2YXIgZXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQodHlwZSwgcGFyYW1zKTtcbiAgZXZlbnQuX3RhcmdldCA9IGVsZW1lbnQ7XG4gIGRvIHtcbiAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuICB9IHdoaWxlIChlbGVtZW50ID0gZWxlbWVudC5wYXJlbnROb2RlKTtcbn1cbnZhciBldmVudEtleVByb3AgPSAnX19kb210YXN0aWNfZXZlbnRfXyc7XG52YXIgaWQgPSAxO1xudmFyIGhhbmRsZXJzID0ge307XG52YXIgdW51c2VkS2V5cyA9IFtdO1xuZnVuY3Rpb24gZ2V0SGFuZGxlcnMoZWxlbWVudCkge1xuICBpZiAoIWVsZW1lbnRbZXZlbnRLZXlQcm9wXSkge1xuICAgIGVsZW1lbnRbZXZlbnRLZXlQcm9wXSA9IHVudXNlZEtleXMubGVuZ3RoID09PSAwID8gKytpZCA6IHVudXNlZEtleXMucG9wKCk7XG4gIH1cbiAgdmFyIGtleSA9IGVsZW1lbnRbZXZlbnRLZXlQcm9wXTtcbiAgcmV0dXJuIGhhbmRsZXJzW2tleV0gfHwgKGhhbmRsZXJzW2tleV0gPSBbXSk7XG59XG5mdW5jdGlvbiBjbGVhckhhbmRsZXJzKGVsZW1lbnQpIHtcbiAgdmFyIGtleSA9IGVsZW1lbnRbZXZlbnRLZXlQcm9wXTtcbiAgaWYgKGhhbmRsZXJzW2tleV0pIHtcbiAgICBoYW5kbGVyc1trZXldID0gbnVsbDtcbiAgICBlbGVtZW50W2tleV0gPSBudWxsO1xuICAgIHVudXNlZEtleXMucHVzaChrZXkpO1xuICB9XG59XG5mdW5jdGlvbiBwcm94eUhhbmRsZXIoaGFuZGxlcikge1xuICByZXR1cm4gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICBoYW5kbGVyKGF1Z21lbnRFdmVudChldmVudCksIGV2ZW50LmRldGFpbCk7XG4gIH07XG59XG52YXIgYXVnbWVudEV2ZW50ID0gKGZ1bmN0aW9uKCkge1xuICB2YXIgZXZlbnRNZXRob2RzID0ge1xuICAgIHByZXZlbnREZWZhdWx0OiAnaXNEZWZhdWx0UHJldmVudGVkJyxcbiAgICBzdG9wSW1tZWRpYXRlUHJvcGFnYXRpb246ICdpc0ltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZCcsXG4gICAgc3RvcFByb3BhZ2F0aW9uOiAnaXNQcm9wYWdhdGlvblN0b3BwZWQnXG4gIH0sXG4gICAgICBub29wID0gKGZ1bmN0aW9uKCkge30pLFxuICAgICAgcmV0dXJuVHJ1ZSA9IChmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9KSxcbiAgICAgIHJldHVybkZhbHNlID0gKGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KTtcbiAgcmV0dXJuIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgZm9yICh2YXIgbWV0aG9kTmFtZSBpbiBldmVudE1ldGhvZHMpIHtcbiAgICAgIChmdW5jdGlvbihtZXRob2ROYW1lLCB0ZXN0TWV0aG9kTmFtZSwgb3JpZ2luYWxNZXRob2QpIHtcbiAgICAgICAgZXZlbnRbbWV0aG9kTmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICB0aGlzW3Rlc3RNZXRob2ROYW1lXSA9IHJldHVyblRydWU7XG4gICAgICAgICAgcmV0dXJuIG9yaWdpbmFsTWV0aG9kLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgICAgIGV2ZW50W3Rlc3RNZXRob2ROYW1lXSA9IHJldHVybkZhbHNlO1xuICAgICAgfShtZXRob2ROYW1lLCBldmVudE1ldGhvZHNbbWV0aG9kTmFtZV0sIGV2ZW50W21ldGhvZE5hbWVdIHx8IG5vb3ApKTtcbiAgICB9XG4gICAgaWYgKGV2ZW50Ll9wcmV2ZW50RGVmYXVsdCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGV2ZW50O1xuICB9O1xufSkoKTtcbmZ1bmN0aW9uIGRlbGVnYXRlSGFuZGxlcihzZWxlY3RvciwgaGFuZGxlciwgZXZlbnQpIHtcbiAgdmFyIGV2ZW50VGFyZ2V0ID0gZXZlbnQuX3RhcmdldCB8fCBldmVudC50YXJnZXQ7XG4gIGlmIChtYXRjaGVzKGV2ZW50VGFyZ2V0LCBzZWxlY3RvcikpIHtcbiAgICBpZiAoIWV2ZW50LmN1cnJlbnRUYXJnZXQpIHtcbiAgICAgIGV2ZW50LmN1cnJlbnRUYXJnZXQgPSBldmVudFRhcmdldDtcbiAgICB9XG4gICAgaGFuZGxlci5jYWxsKGV2ZW50VGFyZ2V0LCBldmVudCk7XG4gIH1cbn1cbihmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gQ3VzdG9tRXZlbnQoZXZlbnQpIHtcbiAgICB2YXIgcGFyYW1zID0gYXJndW1lbnRzWzFdICE9PSAodm9pZCAwKSA/IGFyZ3VtZW50c1sxXSA6IHtcbiAgICAgIGJ1YmJsZXM6IGZhbHNlLFxuICAgICAgY2FuY2VsYWJsZTogZmFsc2UsXG4gICAgICBkZXRhaWw6IHVuZGVmaW5lZFxuICAgIH07XG4gICAgdmFyIGN1c3RvbUV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0N1c3RvbUV2ZW50Jyk7XG4gICAgY3VzdG9tRXZlbnQuaW5pdEN1c3RvbUV2ZW50KGV2ZW50LCBwYXJhbXMuYnViYmxlcywgcGFyYW1zLmNhbmNlbGFibGUsIHBhcmFtcy5kZXRhaWwpO1xuICAgIHJldHVybiBjdXN0b21FdmVudDtcbiAgfVxuICBDdXN0b21FdmVudC5wcm90b3R5cGUgPSBnbG9iYWwuQ3VzdG9tRXZlbnQgJiYgZ2xvYmFsLkN1c3RvbUV2ZW50LnByb3RvdHlwZTtcbiAgZ2xvYmFsLkN1c3RvbUV2ZW50ID0gQ3VzdG9tRXZlbnQ7XG59KSgpO1xudmFyIGlzRXZlbnRCdWJibGluZ0luRGV0YWNoZWRUcmVlID0gKGZ1bmN0aW9uKCkge1xuICB2YXIgaXNCdWJibGluZyA9IGZhbHNlLFxuICAgICAgZG9jID0gZ2xvYmFsLmRvY3VtZW50O1xuICBpZiAoZG9jKSB7XG4gICAgdmFyIHBhcmVudCA9IGRvYy5jcmVhdGVFbGVtZW50KCdkaXYnKSxcbiAgICAgICAgY2hpbGQgPSBwYXJlbnQuY2xvbmVOb2RlKCk7XG4gICAgcGFyZW50LmFwcGVuZENoaWxkKGNoaWxkKTtcbiAgICBwYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcignZScsIGZ1bmN0aW9uKCkge1xuICAgICAgaXNCdWJibGluZyA9IHRydWU7XG4gICAgfSk7XG4gICAgY2hpbGQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ2UnLCB7YnViYmxlczogdHJ1ZX0pKTtcbiAgfVxuICByZXR1cm4gaXNCdWJibGluZztcbn0pKCk7XG52YXIgYmluZCA9IG9uLFxuICAgIHVuYmluZCA9IG9mZjtcbjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBvbjogb24sXG4gIG9mZjogb2ZmLFxuICBkZWxlZ2F0ZTogZGVsZWdhdGUsXG4gIHVuZGVsZWdhdGU6IHVuZGVsZWdhdGUsXG4gIHRyaWdnZXI6IHRyaWdnZXIsXG4gIHRyaWdnZXJIYW5kbGVyOiB0cmlnZ2VySGFuZGxlcixcbiAgcmVhZHk6IHJlYWR5LFxuICBiaW5kOiBiaW5kLFxuICB1bmJpbmQ6IHVuYmluZCxcbiAgX19lc01vZHVsZTogdHJ1ZVxufTtcblxuXG59LHtcIi4vc2VsZWN0b3JcIjoxMyxcIi4vdXRpbFwiOjE1fV0sOTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy9odG1sXCI7XG52YXIgZWFjaCA9IF9kZXJlcV8oJy4vdXRpbCcpLmVhY2g7XG5mdW5jdGlvbiBodG1sKGZyYWdtZW50KSB7XG4gIGlmICh0eXBlb2YgZnJhZ21lbnQgIT09ICdzdHJpbmcnKSB7XG4gICAgdmFyIGVsZW1lbnQgPSB0aGlzLm5vZGVUeXBlID8gdGhpcyA6IHRoaXNbMF07XG4gICAgcmV0dXJuIGVsZW1lbnQgPyBlbGVtZW50LmlubmVySFRNTCA6IHVuZGVmaW5lZDtcbiAgfVxuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50LmlubmVySFRNTCA9IGZyYWdtZW50O1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG47XG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgaHRtbDogaHRtbCxcbiAgX19lc01vZHVsZTogdHJ1ZVxufTtcblxuXG59LHtcIi4vdXRpbFwiOjE1fV0sMTA6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuXCJ1c2Ugc3RyaWN0XCI7XG52YXIgX19tb2R1bGVOYW1lID0gXCJzcmMvaW5kZXhcIjtcbnZhciAkID0gX2RlcmVxXygnLi9hcGknKS5kZWZhdWx0O1xudmFyICRfX2RlZmF1bHQgPSAkO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmF1bHQ6ICRfX2RlZmF1bHQsXG4gIF9fZXNNb2R1bGU6IHRydWVcbn07XG5cblxufSx7XCIuL2FwaVwiOjF9XSwxMTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy9tb2RlXCI7XG52YXIgZ2xvYmFsID0gX2RlcmVxXygnLi91dGlsJykuZ2xvYmFsO1xudmFyIGlzTmF0aXZlID0gZmFsc2U7XG5mdW5jdGlvbiBuYXRpdmUoKSB7XG4gIHZhciBnb05hdGl2ZSA9IGFyZ3VtZW50c1swXSAhPT0gKHZvaWQgMCkgPyBhcmd1bWVudHNbMF0gOiB0cnVlO1xuICB2YXIgd2FzTmF0aXZlID0gaXNOYXRpdmU7XG4gIGlzTmF0aXZlID0gZ29OYXRpdmU7XG4gIGlmIChnbG9iYWwuJCkge1xuICAgIGdsb2JhbC4kLmlzTmF0aXZlID0gaXNOYXRpdmU7XG4gIH1cbiAgaWYgKCF3YXNOYXRpdmUgJiYgaXNOYXRpdmUpIHtcbiAgICBhdWdtZW50TmF0aXZlUHJvdG90eXBlcyh0aGlzLmZuLCB0aGlzLmZuTGlzdCk7XG4gIH1cbiAgaWYgKHdhc05hdGl2ZSAmJiAhaXNOYXRpdmUpIHtcbiAgICB1bmF1Z21lbnROYXRpdmVQcm90b3R5cGVzKHRoaXMuZm4sIHRoaXMuZm5MaXN0KTtcbiAgfVxuICByZXR1cm4gaXNOYXRpdmU7XG59XG52YXIgTm9kZVByb3RvID0gdHlwZW9mIE5vZGUgIT09ICd1bmRlZmluZWQnICYmIE5vZGUucHJvdG90eXBlLFxuICAgIE5vZGVMaXN0UHJvdG8gPSB0eXBlb2YgTm9kZUxpc3QgIT09ICd1bmRlZmluZWQnICYmIE5vZGVMaXN0LnByb3RvdHlwZTtcbmZ1bmN0aW9uIGF1Z21lbnQob2JqLCBrZXksIHZhbHVlKSB7XG4gIGlmICghb2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBrZXksIHtcbiAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGVudW1lcmFibGU6IGZhbHNlXG4gICAgfSk7XG4gIH1cbn1cbnZhciB1bmF1Z21lbnQgPSAoZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgZGVsZXRlIG9ialtrZXldO1xufSk7XG5mdW5jdGlvbiBhdWdtZW50TmF0aXZlUHJvdG90eXBlcyhtZXRob2RzTm9kZSwgbWV0aG9kc05vZGVMaXN0KSB7XG4gIHZhciBrZXk7XG4gIGZvciAoa2V5IGluIG1ldGhvZHNOb2RlKSB7XG4gICAgYXVnbWVudChOb2RlUHJvdG8sIGtleSwgbWV0aG9kc05vZGVba2V5XSk7XG4gICAgYXVnbWVudChOb2RlTGlzdFByb3RvLCBrZXksIG1ldGhvZHNOb2RlW2tleV0pO1xuICB9XG4gIGZvciAoa2V5IGluIG1ldGhvZHNOb2RlTGlzdCkge1xuICAgIGF1Z21lbnQoTm9kZUxpc3RQcm90bywga2V5LCBtZXRob2RzTm9kZUxpc3Rba2V5XSk7XG4gIH1cbn1cbmZ1bmN0aW9uIHVuYXVnbWVudE5hdGl2ZVByb3RvdHlwZXMobWV0aG9kc05vZGUsIG1ldGhvZHNOb2RlTGlzdCkge1xuICB2YXIga2V5O1xuICBmb3IgKGtleSBpbiBtZXRob2RzTm9kZSkge1xuICAgIHVuYXVnbWVudChOb2RlUHJvdG8sIGtleSk7XG4gICAgdW5hdWdtZW50KE5vZGVMaXN0UHJvdG8sIGtleSk7XG4gIH1cbiAgZm9yIChrZXkgaW4gbWV0aG9kc05vZGVMaXN0KSB7XG4gICAgdW5hdWdtZW50KE5vZGVMaXN0UHJvdG8sIGtleSk7XG4gIH1cbn1cbjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBpc05hdGl2ZTogaXNOYXRpdmUsXG4gIG5hdGl2ZTogbmF0aXZlLFxuICBfX2VzTW9kdWxlOiB0cnVlXG59O1xuXG5cbn0se1wiLi91dGlsXCI6MTV9XSwxMjpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy9ub2NvbmZsaWN0XCI7XG52YXIgZ2xvYmFsID0gX2RlcmVxXygnLi91dGlsJykuZ2xvYmFsO1xudmFyIHByZXZpb3VzTGliID0gZ2xvYmFsLiQ7XG5mdW5jdGlvbiBub0NvbmZsaWN0KCkge1xuICBnbG9iYWwuJCA9IHByZXZpb3VzTGliO1xuICByZXR1cm4gdGhpcztcbn1cbjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBub0NvbmZsaWN0OiBub0NvbmZsaWN0LFxuICBfX2VzTW9kdWxlOiB0cnVlXG59O1xuXG5cbn0se1wiLi91dGlsXCI6MTV9XSwxMzpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy9zZWxlY3RvclwiO1xudmFyICRfXzAgPSBfZGVyZXFfKCcuL3V0aWwnKSxcbiAgICBnbG9iYWwgPSAkX18wLmdsb2JhbCxcbiAgICBtYWtlSXRlcmFibGUgPSAkX18wLm1ha2VJdGVyYWJsZTtcbnZhciBzbGljZSA9IFtdLnNsaWNlLFxuICAgIGlzUHJvdG90eXBlU2V0ID0gZmFsc2UsXG4gICAgcmVGcmFnbWVudCA9IC9eXFxzKjwoXFx3K3whKVtePl0qPi8sXG4gICAgcmVTaW5nbGVUYWcgPSAvXjwoXFx3KylcXHMqXFwvPz4oPzo8XFwvXFwxPnwpJC8sXG4gICAgcmVTaW1wbGVTZWxlY3RvciA9IC9eW1xcLiNdP1tcXHctXSokLztcbmZ1bmN0aW9uICQoc2VsZWN0b3IpIHtcbiAgdmFyIGNvbnRleHQgPSBhcmd1bWVudHNbMV0gIT09ICh2b2lkIDApID8gYXJndW1lbnRzWzFdIDogZG9jdW1lbnQ7XG4gIHZhciBjb2xsZWN0aW9uO1xuICBpZiAoIXNlbGVjdG9yKSB7XG4gICAgY29sbGVjdGlvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwobnVsbCk7XG4gIH0gZWxzZSBpZiAoc2VsZWN0b3IgaW5zdGFuY2VvZiBXcmFwcGVyKSB7XG4gICAgcmV0dXJuIHNlbGVjdG9yO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBzZWxlY3RvciAhPT0gJ3N0cmluZycpIHtcbiAgICBjb2xsZWN0aW9uID0gbWFrZUl0ZXJhYmxlKHNlbGVjdG9yKTtcbiAgfSBlbHNlIGlmIChyZUZyYWdtZW50LnRlc3Qoc2VsZWN0b3IpKSB7XG4gICAgY29sbGVjdGlvbiA9IGNyZWF0ZUZyYWdtZW50KHNlbGVjdG9yKTtcbiAgfSBlbHNlIHtcbiAgICBjb250ZXh0ID0gdHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnID8gZG9jdW1lbnQucXVlcnlTZWxlY3Rvcihjb250ZXh0KSA6IGNvbnRleHQubGVuZ3RoID8gY29udGV4dFswXSA6IGNvbnRleHQ7XG4gICAgY29sbGVjdGlvbiA9IHF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IsIGNvbnRleHQpO1xuICB9XG4gIHJldHVybiAkLmlzTmF0aXZlID8gY29sbGVjdGlvbiA6IHdyYXAoY29sbGVjdGlvbik7XG59XG5mdW5jdGlvbiBmaW5kKHNlbGVjdG9yKSB7XG4gIHJldHVybiAkKHNlbGVjdG9yLCB0aGlzKTtcbn1cbnZhciBtYXRjaGVzID0gKGZ1bmN0aW9uKCkge1xuICB2YXIgY29udGV4dCA9IHR5cGVvZiBFbGVtZW50ICE9PSAndW5kZWZpbmVkJyA/IEVsZW1lbnQucHJvdG90eXBlIDogZ2xvYmFsLFxuICAgICAgX21hdGNoZXMgPSBjb250ZXh0Lm1hdGNoZXMgfHwgY29udGV4dC5tYXRjaGVzU2VsZWN0b3IgfHwgY29udGV4dC5tb3pNYXRjaGVzU2VsZWN0b3IgfHwgY29udGV4dC53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHwgY29udGV4dC5tc01hdGNoZXNTZWxlY3RvciB8fCBjb250ZXh0Lm9NYXRjaGVzU2VsZWN0b3I7XG4gIHJldHVybiBmdW5jdGlvbihlbGVtZW50LCBzZWxlY3Rvcikge1xuICAgIHJldHVybiBfbWF0Y2hlcy5jYWxsKGVsZW1lbnQsIHNlbGVjdG9yKTtcbiAgfTtcbn0pKCk7XG5mdW5jdGlvbiBxdWVyeVNlbGVjdG9yKHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gIHZhciBpc1NpbXBsZVNlbGVjdG9yID0gcmVTaW1wbGVTZWxlY3Rvci50ZXN0KHNlbGVjdG9yKTtcbiAgaWYgKGlzU2ltcGxlU2VsZWN0b3IgJiYgISQuaXNOYXRpdmUpIHtcbiAgICBpZiAoc2VsZWN0b3JbMF0gPT09ICcjJykge1xuICAgICAgdmFyIGVsZW1lbnQgPSAoY29udGV4dC5nZXRFbGVtZW50QnlJZCA/IGNvbnRleHQgOiBkb2N1bWVudCkuZ2V0RWxlbWVudEJ5SWQoc2VsZWN0b3Iuc2xpY2UoMSkpO1xuICAgICAgcmV0dXJuIGVsZW1lbnQgPyBbZWxlbWVudF0gOiBbXTtcbiAgICB9XG4gICAgaWYgKHNlbGVjdG9yWzBdID09PSAnLicpIHtcbiAgICAgIHJldHVybiBjb250ZXh0LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoc2VsZWN0b3Iuc2xpY2UoMSkpO1xuICAgIH1cbiAgICByZXR1cm4gY29udGV4dC5nZXRFbGVtZW50c0J5VGFnTmFtZShzZWxlY3Rvcik7XG4gIH1cbiAgcmV0dXJuIGNvbnRleHQucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG59XG5mdW5jdGlvbiBjcmVhdGVGcmFnbWVudChodG1sKSB7XG4gIGlmIChyZVNpbmdsZVRhZy50ZXN0KGh0bWwpKSB7XG4gICAgcmV0dXJuIFtkb2N1bWVudC5jcmVhdGVFbGVtZW50KFJlZ0V4cC4kMSldO1xuICB9XG4gIHZhciBlbGVtZW50cyA9IFtdLFxuICAgICAgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG4gICAgICBjaGlsZHJlbiA9IGNvbnRhaW5lci5jaGlsZE5vZGVzO1xuICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbDtcbiAgZm9yICh2YXIgaSA9IDAsXG4gICAgICBsID0gY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgZWxlbWVudHMucHVzaChjaGlsZHJlbltpXSk7XG4gIH1cbiAgcmV0dXJuIGVsZW1lbnRzO1xufVxuZnVuY3Rpb24gd3JhcChjb2xsZWN0aW9uKSB7XG4gIGlmICghaXNQcm90b3R5cGVTZXQpIHtcbiAgICBXcmFwcGVyLnByb3RvdHlwZSA9ICQuZm47XG4gICAgV3JhcHBlci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBXcmFwcGVyO1xuICAgIGlzUHJvdG90eXBlU2V0ID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV3IFdyYXBwZXIoY29sbGVjdGlvbik7XG59XG5mdW5jdGlvbiBXcmFwcGVyKGNvbGxlY3Rpb24pIHtcbiAgdmFyIGkgPSAwLFxuICAgICAgbGVuZ3RoID0gY29sbGVjdGlvbi5sZW5ndGg7XG4gIGZvciAoOyBpIDwgbGVuZ3RoOyApIHtcbiAgICB0aGlzW2ldID0gY29sbGVjdGlvbltpKytdO1xuICB9XG4gIHRoaXMubGVuZ3RoID0gbGVuZ3RoO1xufVxuO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gICQ6ICQsXG4gIGZpbmQ6IGZpbmQsXG4gIG1hdGNoZXM6IG1hdGNoZXMsXG4gIF9fZXNNb2R1bGU6IHRydWVcbn07XG5cblxufSx7XCIuL3V0aWxcIjoxNX1dLDE0OltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblwidXNlIHN0cmljdFwiO1xudmFyIF9fbW9kdWxlTmFtZSA9IFwic3JjL3NlbGVjdG9yX2V4dHJhXCI7XG52YXIgJF9fMCA9IF9kZXJlcV8oJy4vdXRpbCcpLFxuICAgIGVhY2ggPSAkX18wLmVhY2gsXG4gICAgdG9BcnJheSA9ICRfXzAudG9BcnJheTtcbnZhciAkX18wID0gX2RlcmVxXygnLi9zZWxlY3RvcicpLFxuICAgICQgPSAkX18wLiQsXG4gICAgbWF0Y2hlcyA9ICRfXzAubWF0Y2hlcztcbmZ1bmN0aW9uIGNoaWxkcmVuKHNlbGVjdG9yKSB7XG4gIHZhciBub2RlcyA9IFtdO1xuICBlYWNoKHRoaXMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBpZiAoZWxlbWVudC5jaGlsZHJlbikge1xuICAgICAgZWFjaChlbGVtZW50LmNoaWxkcmVuLCBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICBpZiAoIXNlbGVjdG9yIHx8IChzZWxlY3RvciAmJiBtYXRjaGVzKGNoaWxkLCBzZWxlY3RvcikpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaChjaGlsZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiAkKG5vZGVzKTtcbn1cbmZ1bmN0aW9uIGNvbnRlbnRzKCkge1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgZWFjaCh0aGlzLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgbm9kZXMucHVzaC5hcHBseShub2RlcywgdG9BcnJheShlbGVtZW50LmNoaWxkTm9kZXMpKTtcbiAgfSk7XG4gIHJldHVybiAkKG5vZGVzKTtcbn1cbmZ1bmN0aW9uIGNsb3Nlc3Qoc2VsZWN0b3IpIHtcbiAgdmFyIG5vZGUgPSB0aGlzWzBdO1xuICBmb3IgKDsgbm9kZS5ub2RlVHlwZSAhPT0gbm9kZS5ET0NVTUVOVF9OT0RFOyBub2RlID0gbm9kZS5wYXJlbnROb2RlKSB7XG4gICAgaWYgKG1hdGNoZXMobm9kZSwgc2VsZWN0b3IpKSB7XG4gICAgICByZXR1cm4gJChub2RlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICQoKTtcbn1cbmZ1bmN0aW9uIHBhcmVudChzZWxlY3Rvcikge1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgZWFjaCh0aGlzLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKCFzZWxlY3RvciB8fCAoc2VsZWN0b3IgJiYgbWF0Y2hlcyhlbGVtZW50LnBhcmVudE5vZGUsIHNlbGVjdG9yKSkpIHtcbiAgICAgIG5vZGVzLnB1c2goZWxlbWVudC5wYXJlbnROb2RlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gJChub2Rlcyk7XG59XG5mdW5jdGlvbiBlcShpbmRleCkge1xuICByZXR1cm4gc2xpY2UuY2FsbCh0aGlzLCBpbmRleCwgaW5kZXggKyAxKTtcbn1cbmZ1bmN0aW9uIGdldChpbmRleCkge1xuICByZXR1cm4gdGhpc1tpbmRleF07XG59XG5mdW5jdGlvbiBzbGljZShzdGFydCwgZW5kKSB7XG4gIHJldHVybiAkKFtdLnNsaWNlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykpO1xufVxuO1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNoaWxkcmVuOiBjaGlsZHJlbixcbiAgY29udGVudHM6IGNvbnRlbnRzLFxuICBjbG9zZXN0OiBjbG9zZXN0LFxuICBwYXJlbnQ6IHBhcmVudCxcbiAgZXE6IGVxLFxuICBnZXQ6IGdldCxcbiAgc2xpY2U6IHNsaWNlLFxuICBfX2VzTW9kdWxlOiB0cnVlXG59O1xuXG5cbn0se1wiLi9zZWxlY3RvclwiOjEzLFwiLi91dGlsXCI6MTV9XSwxNTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG5cInVzZSBzdHJpY3RcIjtcbnZhciBfX21vZHVsZU5hbWUgPSBcInNyYy91dGlsXCI7XG52YXIgZ2xvYmFsID0gbmV3IEZ1bmN0aW9uKFwicmV0dXJuIHRoaXNcIikoKSxcbiAgICBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciB0b0FycmF5ID0gKGZ1bmN0aW9uKGNvbGxlY3Rpb24pIHtcbiAgcmV0dXJuIHNsaWNlLmNhbGwoY29sbGVjdGlvbik7XG59KTtcbnZhciBtYWtlSXRlcmFibGUgPSAoZnVuY3Rpb24oZWxlbWVudCkge1xuICByZXR1cm4gZWxlbWVudC5ub2RlVHlwZSB8fCBlbGVtZW50ID09PSB3aW5kb3cgPyBbZWxlbWVudF0gOiBlbGVtZW50O1xufSk7XG5mdW5jdGlvbiBlYWNoKGNvbGxlY3Rpb24sIGNhbGxiYWNrKSB7XG4gIHZhciBsZW5ndGggPSBjb2xsZWN0aW9uLmxlbmd0aDtcbiAgaWYgKGxlbmd0aCAhPT0gdW5kZWZpbmVkICYmIGNvbGxlY3Rpb24ubm9kZVR5cGUgPT09IHVuZGVmaW5lZCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGNhbGxiYWNrKGNvbGxlY3Rpb25baV0sIGksIGNvbGxlY3Rpb24pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjYWxsYmFjayhjb2xsZWN0aW9uLCAwLCBjb2xsZWN0aW9uKTtcbiAgfVxuICByZXR1cm4gY29sbGVjdGlvbjtcbn1cbmZ1bmN0aW9uIGV4dGVuZCh0YXJnZXQpIHtcbiAgZm9yICh2YXIgc291cmNlcyA9IFtdLFxuICAgICAgJF9fMCA9IDE7ICRfXzAgPCBhcmd1bWVudHMubGVuZ3RoOyAkX18wKyspXG4gICAgc291cmNlc1skX18wIC0gMV0gPSBhcmd1bWVudHNbJF9fMF07XG4gIHNvdXJjZXMuZm9yRWFjaChmdW5jdGlvbihzcmMpIHtcbiAgICBpZiAoc3JjKSB7XG4gICAgICBmb3IgKHZhciBwcm9wIGluIHNyYykge1xuICAgICAgICB0YXJnZXRbcHJvcF0gPSBzcmNbcHJvcF07XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHRhcmdldDtcbn1cbjtcbm1vZHVsZS5leHBvcnRzID0ge1xuICBnbG9iYWw6IGdsb2JhbCxcbiAgdG9BcnJheTogdG9BcnJheSxcbiAgbWFrZUl0ZXJhYmxlOiBtYWtlSXRlcmFibGUsXG4gIGVhY2g6IGVhY2gsXG4gIGV4dGVuZDogZXh0ZW5kLFxuICBfX2VzTW9kdWxlOiB0cnVlXG59O1xuXG5cbn0se31dfSx7fSxbMTBdKVxuKDEwKVxufSk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIG9iaiAgICAgPSByZXF1aXJlKCcuL21vZHVsZXMvb2JqJylcbiwgICBldmVudHMgID0gcmVxdWlyZSgnLi9tb2R1bGVzL2V2ZW50cycpXG4sICAgY29udGVudCA9IHJlcXVpcmUoJy4vbW9kdWxlcy9jb250ZW50Jyk7XG5cbmNvbnRlbnQuaW5pdCgpO1xub2JqLmluaXQoKTtcbmV2ZW50cygpO1xuXG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciAkID0gd2luZG93LmpRdWVyeSB8fCByZXF1aXJlKCdkb210YXN0aWMnKTtcblxudmFyICRib2R5ICAgICAgPSAkKCdib2R5JyksXG4gICAgaXNPcmlnaW5hbCA9IHRydWU7XG5cbnZhciBjb250ZW50ID0ge1xuXG4gIGluaXQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLndyYXBDb250ZW50KCk7XG4gIH0sXG5cbiAgd3JhcENvbnRlbnQ6IGZ1bmN0aW9uKCkge1xuICAgICRib2R5Lmh0bWwoJzxkaXYgaWQ9XCJuaWNlLWNvbnRlbnRcIj4nICsgJGJvZHkuaHRtbCgpICsgJzwvZGl2PicpO1xuICAgIHRoaXMub3JpZ2luYWxIVE1MID0gdGhpcy5jdXJyZW50SFRNTCA9IHRoaXMuZ2V0SFRNTCgpO1xuICAgIHJldHVybiB0aGlzLm1ha2VFZGl0YWJsZSgkYm9keSk7XG4gIH0sXG5cbiAgbWFrZUVkaXRhYmxlOiBmdW5jdGlvbihlbCkge1xuICAgIHJldHVybiBlbC5hdHRyKCdjb250ZW50ZWRpdGFibGUnLCB0cnVlKTtcbiAgfSxcblxuICByZW1vdmVOaWNlOiBmdW5jdGlvbigpIHtcbiAgICAkYm9keVxuICAgICAgLmh0bWwoJCgnI25pY2UtY29udGVudCcpLmh0bWwoKSlcbiAgICAgIC5yZW1vdmVBdHRyKCdjb250ZW50ZWRpdGFibGUnKTtcbiAgfSxcblxuICBnZXRIVE1MOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgaHRtbCA9ICQoJyNuaWNlLWNvbnRlbnQnKS5odG1sKCk7XG4gICAgcmV0dXJuIGh0bWxcbiAgICAgICAgICAgIC50cmltKClcbiAgICAgICAgICAgIC5yZXBsYWNlKC8+XFxzKzwvZywgJz48JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC8+PC9nLCAnPlxcblxcbjwnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL148aWZyYW1lLitcXC9pZnJhbWU+L2csICcnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL148b2JqZWN0LitcXC9vYmplY3Q+L2csICcnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL148bm9zY3JpcHQuK1xcL25vc2NyaXB0Pi9nLCAnJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC88c2NyaXB0LitcXC9zY3JpcHQ+L2csICcnKTtcbiAgfSxcblxuICBzZXRIVE1MOiBmdW5jdGlvbihodG1sKSB7XG4gICAgcmV0dXJuICQoJyNuaWNlLWNvbnRlbnQnKS5odG1sKGh0bWwpO1xuICB9LFxuXG4gIHRvZ2dsZUhUTUw6IGZ1bmN0aW9uKCkge1xuXG4gICAgaXNPcmlnaW5hbCA9IHRoaXMuZ2V0SFRNTCgpID09PSB0aGlzLm9yaWdpbmFsSFRNTCA/IHRydWUgOiBmYWxzZTtcblxuICAgIGlmICghaXNPcmlnaW5hbCkge1xuICAgICAgdGhpcy5jdXJyZW50SFRNTCA9IHRoaXMuZ2V0SFRNTCgpO1xuICAgIH1cblxuICAgIHZhciBodG1sID0gaXNPcmlnaW5hbCA/IHRoaXMuY3VycmVudEhUTUwgOiB0aGlzLm9yaWdpbmFsSFRNTDtcblxuICAgIHRoaXMuc2V0SFRNTChodG1sKTtcblxuICB9LFxuXG4gIGdldFNlbGVjdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJhbmdlO1xuICAgIGlmIChkb2N1bWVudC5zZWxlY3Rpb24pIHtcbiAgICAgIHJhbmdlID0gZG9jdW1lbnQuYm9keS5jcmVhdGVUZXh0UmFuZ2UoKTtcbiAgICAgIHJhbmdlLm1vdmVUb0VsZW1lbnRUZXh0KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduaWNlLXByZScpKTtcbiAgICAgIHJhbmdlLnNlbGVjdCgpO1xuICAgIH0gZWxzZSBpZiAod2luZG93LmdldFNlbGVjdGlvbikge1xuICAgICAgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgICAgcmFuZ2Uuc2VsZWN0Tm9kZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmljZS1wcmUnKSk7XG4gICAgICB3aW5kb3cuZ2V0U2VsZWN0aW9uKCkuYWRkUmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICB9LFxuXG4gIG9yaWdpbmFsSFRNTDogJycsXG5cbiAgY3VycmVudEhUTUw6ICcnXG5cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gY29udGVudDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSB3aW5kb3cualF1ZXkgfHwgcmVxdWlyZSgnZG9tdGFzdGljJylcbiwgICBqc2RpZmYgPSByZXF1aXJlKCdkaWZmJylcbiwgICBjb250ZW50ID0gcmVxdWlyZSgnLi9jb250ZW50Jyk7XG5cbnZhciBkaWZmT2JqID0ge1xuXG4gIGluaXQ6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBkaWZmID0ganNkaWZmLmRpZmZMaW5lcyhjb250ZW50Lm9yaWdpbmFsSFRNTCwgY29udGVudC5nZXRIVE1MKCkpO1xuICAgIHRoaXMucG9wdWxhdGVEaWZmKGRpZmYpO1xuICB9LFxuXG4gIHBvcHVsYXRlRGlmZjogZnVuY3Rpb24oZGlmZikge1xuICAgIHZhciAkcHJlID0gJCgnI25pY2UtcHJlJykuaHRtbCgnJylcbiAgICAsICAgY29sb3JcbiAgICAsICAga2xhc3NcbiAgICAsICAgc3BhbjtcblxuXG4gICAgZGlmZi5mb3JFYWNoKGZ1bmN0aW9uKHBhcnQpIHtcbiAgICAgIGlmIChwYXJ0LmFkZGVkIHx8IHBhcnQucmVtb3ZlZCkge1xuICAgICAgICBjb2xvciA9IHBhcnQuYWRkZWQgPyAnZ3JlZW4nIDogcGFydC5yZW1vdmVkID8gJ3JlZCcgOiAnZ3JleSc7XG4gICAgICAgIGtsYXNzID0gcGFydC5hZGRlZCA/ICdpcy1hZGRlZCcgOiBwYXJ0LnJlbW92ZWQgPyAnaXMtcmVtb3ZlZCcgOiAnJztcbiAgICAgICAgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgc3Bhbi5zdHlsZS5jb2xvciA9IGNvbG9yO1xuICAgICAgICBzcGFuLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBrbGFzcyk7XG4gICAgICAgIHNwYW4uYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocGFydC52YWx1ZSkpO1xuICAgICAgICAkcHJlLmFwcGVuZChzcGFuKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpZmZPYmo7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciAkICAgICAgID0gd2luZG93LmpRdWVyeSB8fCByZXF1aXJlKCdkb210YXN0aWMnKVxuLCAgIGRpZmYgICAgPSByZXF1aXJlKCcuL2RpZmYnKVxuLCAgIGNvbnRlbnQgPSByZXF1aXJlKCcuL2NvbnRlbnQnKTtcblxudmFyIGV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXG4gICQoJyNuaWNlLW1pbicpLm9uKCdjbGljaycsIGZ1bmN0aW9uKGUpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgJCgnI25pY2Utb2JqJykudG9nZ2xlQ2xhc3MoJ2lzLW1pbicpO1xuICB9KTtcblxuICAkKCcjbmljZS1vZmYnKS5vbignY2xpY2snLCBmdW5jdGlvbihlKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnRlbnQucmVtb3ZlTmljZSgpO1xuICB9KTtcblxuICAkKCcjbmljZS1kaWZmJykub24oJ2NsaWNrJywgZnVuY3Rpb24oZSkge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAkKCcjbmljZS1wcmUnKS50b2dnbGVDbGFzcygnaXMtYWN0aXZlJyk7XG4gICAgZGlmZi5pbml0KCk7XG4gIH0pO1xuXG4gICQoJyNuaWNlLXRvZ2dsZScpLm9uKCdjbGljaycsIGZ1bmN0aW9uKGUpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29udGVudC50b2dnbGVIVE1MKCk7XG4gIH0pO1xuXG4gICQoJyNuaWNlLXByZScpLm9uKCdjbGljaycsIGZ1bmN0aW9uKGUpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29udGVudC5nZXRTZWxlY3Rpb24oKTtcbiAgfSk7XG5cbiAgJCgnI25pY2UtbmF2IGxpJylcbiAgICAub24oJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgIHZhciAkdGl0bGUgPSAkKCcjbmljZS10aXRsZScpO1xuICAgICAgJHRpdGxlLnRleHQoJChlLnNyY0VsZW1lbnQpLmF0dHIoJ2RhdGEtdGV4dCcpKTtcbiAgICB9KS5vbignbW91c2VsZWF2ZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgIHZhciAkdGl0bGUgPSAkKCcjbmljZS10aXRsZScpO1xuICAgICAgJHRpdGxlLnRleHQoJHRpdGxlLmF0dHIoJ2RhdGEtdGV4dCcpKTtcbiAgICB9KTtcblxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBldmVudHM7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBvYmpUZW1wbGF0ZSA9IHJlcXVpcmUoJy4vdGVtcGxhdGUnKTtcblxudmFyIGJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYm9keScpWyAwIF07XG52YXIgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbIDAgXTtcblxudmFyIG5hdiA9IHtcblxuICBpbml0OiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNyZWF0ZU9iaigpO1xuICB9LFxuXG4gIGNyZWF0ZU9iajogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGRpdi5zZXRBdHRyaWJ1dGUoJ2lkJywgJ25pY2Utb2JqJyk7XG4gICAgZGl2LnNldEF0dHJpYnV0ZSgnY29udGVudGVkaXRhYmxlJywgZmFsc2UpO1xuICAgIGRpdi5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ2lzLW1pbicpO1xuICAgIGRpdi5pbm5lckhUTUwgPSBvYmpUZW1wbGF0ZTtcbiAgICB0aGlzLnN0eWxlKGRpdik7XG4gIH0sXG5cbiAgc3R5bGU6IGZ1bmN0aW9uKGRpdikge1xuICAgIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICAgIGxpbmsuc2V0QXR0cmlidXRlKCdyZWwnLCdzdHlsZXNoZWV0Jyk7XG4gICAgbGluay5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCdodHRwczovL3NlZXRocm91Z2h0cmVlcy5naXRodWIuaW8vaW5saW5lLWNvcHktZWRpdG9yL2luZGV4LmNzcycpO1xuICAgIGxpbmsuc2V0QXR0cmlidXRlKCd0eXBlJywndGV4dC9jc3MnKTtcbiAgICBoZWFkLmFwcGVuZENoaWxkKGxpbmspO1xuICAgIHRoaXMuYXBwZW5kKGRpdik7XG4gIH0sXG5cbiAgYXBwZW5kOiBmdW5jdGlvbihkaXYpIHtcbiAgICBib2R5LmFwcGVuZENoaWxkKGRpdik7XG4gIH1cblxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBuYXY7XG4iLCIndXNlIHN0cmljdCc7XG5cbi8vIHNldCBvYmpUZW1wbGF0ZVxudmFyIG9ialRlbXBsYXRlID0gJzx1bCBpZD1cIm5pY2UtbmF2XCI+JztcbiAgICBvYmpUZW1wbGF0ZSArPSAnPGxpIGlkPVwibmljZS10aXRsZVwiIGRhdGEtdGV4dD1cIk5JQ0VcIiB0aXRsZT1cIkdvIFRvIEhvbWVwYWdlXCI+TklDRTwvbGk+JztcbiAgICBvYmpUZW1wbGF0ZSArPSAnPGxpIGlkPVwibmljZS1taW5cIiBkYXRhLXRleHQ9XCJISURFXCIgdGl0bGU9XCJNaW5pbWl6ZSBOSUNFXCI+PHNwYW4+XFx1RTAwMTwvc3Bhbj48L2xpPic7XG4gICAgb2JqVGVtcGxhdGUgKz0gJzxsaSBpZD1cIm5pY2Utb2ZmXCIgZGF0YS10ZXh0PVwiT0ZGXCIgdGl0bGU9XCJUdXJuIG9mZiBOSUNFXCI+XFx1RTAwMzwvbGk+JztcbiAgICBvYmpUZW1wbGF0ZSArPSAnPGxpIGlkPVwibmljZS1kaWZmXCIgZGF0YS10ZXh0PVwiRElGRlwiIHRpdGxlPVwiU2VlIERpZmZcIj5cXHVFMDAyPC9saT4nO1xuICAgIG9ialRlbXBsYXRlICs9ICc8bGkgaWQ9XCJuaWNlLXRvZ2dsZVwiIGRhdGEtdGV4dD1cIlRPR0dMRVwiIHRpdGxlPVwiVG9nZ2xlIE9yaWdpbmFsXCI+XFx1RTAwNDwvbGk+JztcbiAgICBvYmpUZW1wbGF0ZSArPSAnPC91bD4nO1xuICAgIG9ialRlbXBsYXRlICs9ICc8cHJlIGlkPVwibmljZS1wcmVcIj48L3ByZT4nO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG9ialRlbXBsYXRlO1xuIl19
