!function e(t,n,i){function r(s,u){if(!n[s]){if(!t[s]){var a="function"==typeof require&&require;if(!u&&a)return a(s,!0);if(o)return o(s,!0);throw new Error("Cannot find module '"+s+"'")}var c=n[s]={exports:{}};t[s][0].call(c.exports,function(e){var n=t[s][1][e];return r(n?n:e)},c,c.exports,e,t,n,i)}return n[s].exports}for(var o="function"==typeof require&&require,s=0;s<i.length;s++)r(i[s]);return r}({1:[function(e,t){var n=function(){function e(e){return{newPos:e.newPos,components:e.components.slice(0)}}function t(e){for(var t=[],n=0;n<e.length;n++)e[n]&&t.push(e[n]);return t}function n(e){var t=e;return t=t.replace(/&/g,"&amp;"),t=t.replace(/</g,"&lt;"),t=t.replace(/>/g,"&gt;"),t=t.replace(/"/g,"&quot;")}var i=function(e){this.ignoreWhitespace=e};i.prototype={diff:function(t,n){if(n===t)return[{value:n}];if(!n)return[{value:t,removed:!0}];if(!t)return[{value:n,added:!0}];n=this.tokenize(n),t=this.tokenize(t);var i=n.length,r=t.length,o=i+r,s=[{newPos:-1,components:[]}],u=this.extractCommon(s[0],n,t,0);if(s[0].newPos+1>=i&&u+1>=r)return s[0].components;for(var a=1;o>=a;a++)for(var c=-1*a;a>=c;c+=2){var l,f=s[c-1],d=s[c+1];u=(d?d.newPos:0)-c,f&&(s[c-1]=void 0);var p=f&&f.newPos+1<i,h=d&&u>=0&&r>u;if(p||h){!p||h&&f.newPos<d.newPos?(l=e(d),this.pushComponent(l.components,t[u],void 0,!0)):(l=e(f),l.newPos++,this.pushComponent(l.components,n[l.newPos],!0,void 0));var u=this.extractCommon(l,n,t,c);if(l.newPos+1>=i&&u+1>=r)return l.components;s[c]=l}else s[c]=void 0}},pushComponent:function(e,t,n,i){var r=e[e.length-1];r&&r.added===n&&r.removed===i?e[e.length-1]={value:this.join(r.value,t),added:n,removed:i}:e.push({value:t,added:n,removed:i})},extractCommon:function(e,t,n,i){for(var r=t.length,o=n.length,s=e.newPos,u=s-i;r>s+1&&o>u+1&&this.equals(t[s+1],n[u+1]);)s++,u++,this.pushComponent(e.components,t[s],void 0,void 0);return e.newPos=s,u},equals:function(e,t){var n=/\S/;return!this.ignoreWhitespace||n.test(e)||n.test(t)?e===t:!0},join:function(e,t){return e+t},tokenize:function(e){return e}};var r=new i,o=new i(!0),s=new i;o.tokenize=s.tokenize=function(e){return t(e.split(/(\s+|\b)/))};var u=new i(!0);u.tokenize=function(e){return t(e.split(/([{}:;,]|\s+)/))};var a=new i;return a.tokenize=function(e){for(var t=[],n=e.split(/^/m),i=0;i<n.length;i++){var r=n[i],o=n[i-1];"\n"==r&&o&&"\r"===o[o.length-1]?t[t.length-1]+="\n":r&&t.push(r)}return t},{Diff:i,diffChars:function(e,t){return r.diff(e,t)},diffWords:function(e,t){return o.diff(e,t)},diffWordsWithSpace:function(e,t){return s.diff(e,t)},diffLines:function(e,t){return a.diff(e,t)},diffCss:function(e,t){return u.diff(e,t)},createPatch:function(e,t,n,i,r){function o(e){return e.map(function(e){return" "+e})}function s(e,t,n){var i=c[c.length-2],r=t===c.length-2,o=t===c.length-3&&(n.added!==i.added||n.removed!==i.removed);/\n$/.test(n.value)||!r&&!o||e.push("\\ No newline at end of file")}var u=[];u.push("Index: "+e),u.push("==================================================================="),u.push("--- "+e+("undefined"==typeof i?"":"	"+i)),u.push("+++ "+e+("undefined"==typeof r?"":"	"+r));var c=a.diff(t,n);c[c.length-1].value||c.pop(),c.push({value:"",lines:[]});for(var l=0,f=0,d=[],p=1,h=1,v=0;v<c.length;v++){var m=c[v],g=m.lines||m.value.replace(/\n$/,"").split("\n");if(m.lines=g,m.added||m.removed){if(!l){var b=c[v-1];l=p,f=h,b&&(d=o(b.lines.slice(-4)),l-=d.length,f-=d.length)}d.push.apply(d,g.map(function(e){return(m.added?"+":"-")+e})),s(d,v,m),m.added?h+=g.length:p+=g.length}else{if(l)if(g.length<=8&&v<c.length-2)d.push.apply(d,o(g));else{var y=Math.min(g.length,4);u.push("@@ -"+l+","+(p-l+y)+" +"+f+","+(h-f+y)+" @@"),u.push.apply(u,d),u.push.apply(u,o(g.slice(0,y))),g.length<=4&&s(u,v,m),l=0,f=0,d=[]}p+=g.length,h+=g.length}}return u.join("\n")+"\n"},applyPatch:function(e,t){for(var n=t.split("\n"),i=[],r=!1,o=!1,s="I"===n[0][0]?4:0;s<n.length;s++)if("@"===n[s][0]){var u=n[s].split(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);i.unshift({start:u[3],oldlength:u[2],oldlines:[],newlength:u[4],newlines:[]})}else"+"===n[s][0]?i[0].newlines.push(n[s].substr(1)):"-"===n[s][0]?i[0].oldlines.push(n[s].substr(1)):" "===n[s][0]?(i[0].newlines.push(n[s].substr(1)),i[0].oldlines.push(n[s].substr(1))):"\\"===n[s][0]&&("+"===n[s-1][0]?r=!0:"-"===n[s-1][0]&&(o=!0));for(var a=e.split("\n"),s=i.length-1;s>=0;s--){for(var c=i[s],l=0;l<c.oldlength;l++)if(a[c.start-1+l]!==c.oldlines[l])return!1;Array.prototype.splice.apply(a,[c.start-1,+c.oldlength].concat(c.newlines))}if(r)for(;!a[a.length-1];)a.pop();else o&&a.push("");return a.join("\n")},convertChangesToXML:function(e){for(var t=[],i=0;i<e.length;i++){var r=e[i];r.added?t.push("<ins>"):r.removed&&t.push("<del>"),t.push(n(r.value)),r.added?t.push("</ins>"):r.removed&&t.push("</del>")}return t.join("")},convertChangesToDMP:function(e){for(var t,n=[],i=0;i<e.length;i++)t=e[i],n.push([t.added?1:t.removed?-1:0,t.value]);return n}}}();"undefined"!=typeof t&&(t.exports=n)},{}],2:[function(e,t,n){(function(i){!function(e){var r=function(){return e()["default"]};if("object"==typeof n)t.exports=r();else if("function"==typeof define&&define.amd)define(r);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof i?o=i:"undefined"!=typeof self&&(o=self),o.$=r()}}(function(){return function t(n,i,r){function o(u,a){if(!i[u]){if(!n[u]){var c="function"==typeof e&&e;if(!a&&c)return c(u,!0);if(s)return s(u,!0);throw new Error("Cannot find module '"+u+"'")}var l=i[u]={exports:{}};n[u][0].call(l.exports,function(e){var t=n[u][1][e];return o(t?t:e)},l,l.exports,t,n,i,r)}return i[u].exports}for(var s="function"==typeof e&&e,u=0;u<r.length;u++)o(r[u]);return o}({1:[function(e,t){"use strict";var n=e("./util").extend,i={},r={},o={},s=e("./array"),u=e("./attr"),a=e("./class"),c=e("./dom"),l=e("./event"),f=e("./html"),d=e("./selector");void 0!==d&&(o=d.$,o.matches=d.matches,i.find=d.find),n(o);var p=e("./noconflict");n(o,p),n(i,s,u,a,c,l,f),n(r,s),o.version="0.7.0",o.extend=n,o.fn=i,o.fnList=r;var h=o;t.exports={"default":h,__esModule:!0}},{"./array":2,"./attr":3,"./class":4,"./dom":5,"./event":6,"./html":7,"./noconflict":9,"./selector":10,"./util":11}],2:[function(e,t){"use strict";function n(e){var t="function"==typeof e?e:function(t){return a(t,e)};return u(c.filter.call(this,t))}function i(e){return o(this,e)}function r(){var e=c.slice.call(this);return u(c.reverse.call(e))}var o=e("./util").each,s=e("./selector"),u=s.$,a=s.matches,c=Array.prototype,l=i,f=c.map,d=c.every,p=c.some,h=c.indexOf;t.exports={each:i,every:d,filter:n,forEach:l,indexOf:h,map:f,reverse:r,some:p,__esModule:!0}},{"./selector":10,"./util":11}],3:[function(e,t){"use strict";function n(e,t){if("string"==typeof e&&"undefined"==typeof t){var n=this.nodeType?this:this[0];return n?n.getAttribute(e):void 0}return r(this,function(n){if("object"==typeof e)for(var i in e)n.setAttribute(i,e[i]);else n.setAttribute(e,t)}),this}function i(e){return r(this,function(t){t.removeAttribute(e)}),this}var r=e("./util").each;t.exports={attr:n,removeAttr:i,__esModule:!0}},{"./util":11}],4:[function(e,t){"use strict";function n(e){return a(this,function(t){t.classList.add(e)}),this}function i(e){return a(this,function(t){t.classList.remove(e)}),this}function r(e){return a(this,function(t){t.classList.toggle(e)}),this}function o(e){return u(this).some(function(t){return t.classList.contains(e)})}var s=e("./util"),u=s.makeIterable,a=s.each;t.exports={addClass:n,removeClass:i,toggleClass:r,hasClass:o,__esModule:!0}},{"./util":11}],5:[function(e,t){"use strict";function n(e){if(this instanceof Node)if("string"==typeof e)this.insertAdjacentHTML("beforeend",e);else if(e instanceof Node)this.appendChild(e);else{var t=e instanceof NodeList?a(e):e;t.forEach(this.appendChild.bind(this))}else for(var i=this.length;i--;){var r=0===i?e:u(e);n.call(this[i],r)}return this}function i(e){if(this instanceof Node)if("string"==typeof e)this.insertAdjacentHTML("afterbegin",e);else if(e instanceof Node)this.insertBefore(e,this.firstChild);else{var t=e instanceof NodeList?a(e):e;t.reverse().forEach(i.bind(this))}else for(var n=this.length;n--;){var r=0===n?e:u(e);i.call(this[n],r)}return this}function r(e){if(this instanceof Node)if("string"==typeof e)this.insertAdjacentHTML("beforebegin",e);else if(e instanceof Node)this.parentNode.insertBefore(e,this);else{var t=e instanceof NodeList?a(e):e;t.forEach(r.bind(this))}else for(var n=this.length;n--;){var i=0===n?e:u(e);r.call(this[n],i)}return this}function o(e){if(this instanceof Node)if("string"==typeof e)this.insertAdjacentHTML("afterend",e);else if(e instanceof Node)this.parentNode.insertBefore(e,this.nextSibling);else{var t=e instanceof NodeList?a(e):e;t.reverse().forEach(o.bind(this))}else for(var n=this.length;n--;){var i=0===n?e:u(e);o.call(this[n],i)}return this}function s(){return $(u(this))}function u(e){return"string"==typeof e?e:e instanceof Node?e.cloneNode(!0):"length"in e?[].map.call(e,function(e){return e.cloneNode(!0)}):e}var a=e("./util").toArray;t.exports={append:n,prepend:i,before:r,after:o,clone:s,__esModule:!0}},{"./util":11}],6:[function(e,t){"use strict";function n(e,t,n,i){"function"==typeof t&&(n=t,t=null);var r=e.split(".");e=r[0]||null;var o=r[1]||null,s=p(n);return g(this,function(r){t&&(s=h.bind(r,t,n)),r.addEventListener(e,s,i||!1),f(r).push({eventName:e,handler:n,eventListener:s,selector:t,namespace:o})}),this}function i(e,t,n,i){if("function"==typeof t&&(n=t,t=null),e){var r=e.split(".");e=r[0];var o=r[1]}return g(this,function(r){var s=f(r);e||o||t||n?(g(s.filter(function(i){return!(e&&i.eventName!==e||o&&i.namespace!==o||n&&i.handler!==n||t&&i.selector!==t)}),function(e){r.removeEventListener(e.eventName,e.eventListener,i||!1),s.splice(s.indexOf(e),1)}),0===s.length&&d(r)):(g(s,function(e){r.removeEventListener(e.eventName,e.eventListener,i||!1)}),d(r))}),this}function r(e,t,i){return n.call(this,t,e,i)}function o(e,t,n){return i.call(this,t,e,n)}function s(e){var t=void 0!==arguments[2]?arguments[2]:{};t.bubbles="boolean"==typeof t.bubbles?t.bubbles:!0,t.cancelable="boolean"==typeof t.cancelable?t.cancelable:!0,t.preventDefault="boolean"==typeof t.preventDefault?t.preventDefault:!1,t.detail=data;var n=new CustomEvent(e,t);return n._preventDefault=t.preventDefault,g(this,function(i){!t.bubbles||T||c(i)?i.dispatchEvent(n):l(i,e,t)}),this}function u(e){this[0]&&s.call(this[0],e,{bubbles:!1,preventDefault:!0})}function a(e){return/complete|loaded|interactive/.test(document.readyState)&&document.body?e():document.addEventListener("DOMContentLoaded",e,!1),this}function c(e){if(e===window||e===document)return!0;var t=e.ownerDocument.documentElement;return t.contains?t.contains(e):t.compareDocumentPosition?!(t.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_DISCONNECTED):!1}function l(e,t){var n=void 0!==arguments[2]?arguments[2]:{};n.bubbles=!1;var i=new CustomEvent(t,n);i._target=e;do e.dispatchEvent(i);while(e=e.parentNode)}function f(e){e[y]||(e[y]=0===L.length?++w:L.pop());var t=e[y];return E[t]||(E[t]=[])}function d(e){var t=e[y];E[t]&&(E[t]=null,e[t]=null,L.push(t))}function p(e){return function(t){e(M(t),t.detail)}}function h(e,t,n){var i=n._target||n.target;b(i,e)&&(n.currentTarget||(n.currentTarget=i),t.call(i,n))}var v=e("./util"),m=v.global,g=v.each,b=e("./selector").matches,y="__domtastic_event__",w=1,E={},L=[],M=function(){var e={preventDefault:"isDefaultPrevented",stopImmediatePropagation:"isImmediatePropagationStopped",stopPropagation:"isPropagationStopped"},t=function(){},n=function(){return!0},i=function(){return!1};return function(r){for(var o in e)!function(e,t,o){r[e]=function(){return this[t]=n,o.apply(this,arguments)},r[t]=i}(o,e[o],r[o]||t);return r._preventDefault&&r.preventDefault(),r}}();!function(){function e(e){var t=void 0!==arguments[1]?arguments[1]:{bubbles:!1,cancelable:!1,detail:void 0},n=document.createEvent("CustomEvent");return n.initCustomEvent(e,t.bubbles,t.cancelable,t.detail),n}e.prototype=m.CustomEvent&&m.CustomEvent.prototype,m.CustomEvent=e}();var T=function(){var e=!1,t=m.document;if(t){var n=t.createElement("div"),i=n.cloneNode();n.appendChild(i),n.addEventListener("e",function(){e=!0}),i.dispatchEvent(new CustomEvent("e",{bubbles:!0}))}return e}(),C=n,x=i;t.exports={on:n,off:i,delegate:r,undelegate:o,trigger:s,triggerHandler:u,ready:a,bind:C,unbind:x,__esModule:!0}},{"./selector":10,"./util":11}],7:[function(e,t){"use strict";function n(e){if("string"!=typeof e){var t=this.nodeType?this:this[0];return t?t.innerHTML:void 0}return i(this,function(t){t.innerHTML=e}),this}var i=e("./util").each;t.exports={html:n,__esModule:!0}},{"./util":11}],8:[function(e,t){"use strict";var n=e("./api").default,i=n;t.exports={"default":i,__esModule:!0}},{"./api":1}],9:[function(e,t){"use strict";function n(){return i.$=r,this}var i=e("./util").global,r=i.$;t.exports={noConflict:n,__esModule:!0}},{"./util":11}],10:[function(e,t){"use strict";function n(e){var t,i=void 0!==arguments[1]?arguments[1]:document;if(e){if(e instanceof u)return e;"string"!=typeof e?t=l(e):d.test(e)?t=o(e):(i="string"==typeof i?document.querySelector(i):i.length?i[0]:i,t=r(e,i))}else t=document.querySelectorAll(null);return n.isNative?t:s(t)}function i(e){return n(e,this)}function r(e,t){var i=h.test(e);if(i&&!n.isNative){if("#"===e[0]){var r=(t.getElementById?t:document).getElementById(e.slice(1));return r?[r]:[]}return"."===e[0]?t.getElementsByClassName(e.slice(1)):t.getElementsByTagName(e)}return t.querySelectorAll(e)}function o(e){if(p.test(e))return[document.createElement(RegExp.$1)];var t=[],n=document.createElement("div"),i=n.childNodes;n.innerHTML=e;for(var r=0,o=i.length;o>r;r++)t.push(i[r]);return t}function s(e){return f||(u.prototype=n.fn,u.prototype.constructor=u,f=!0),new u(e)}function u(e){for(var t=0,n=e.length;n>t;)this[t]=e[t++];this.length=n}var a=e("./util"),c=a.global,l=a.makeIterable,f=([].slice,!1),d=/^\s*<(\w+|!)[^>]*>/,p=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,h=/^[\.#]?[\w-]*$/,v=function(){var e="undefined"!=typeof Element?Element.prototype:c,t=e.matches||e.matchesSelector||e.mozMatchesSelector||e.webkitMatchesSelector||e.msMatchesSelector||e.oMatchesSelector;return function(e,n){return t.call(e,n)}}();t.exports={$:n,find:i,matches:v,__esModule:!0}},{"./util":11}],11:[function(e,t){"use strict";function n(e,t){var n=e.length;if(void 0!==n&&void 0===e.nodeType)for(var i=0;n>i;i++)t(e[i],i,e);else t(e,0,e);return e}function i(e){for(var t=[],n=1;n<arguments.length;n++)t[n-1]=arguments[n];return t.forEach(function(t){if(t)for(var n in t)e[n]=t[n]}),e}var r=new Function("return this")(),o=Array.prototype.slice,s=function(e){return o.call(e)},u=function(e){return e.nodeType||e===window?[e]:e};t.exports={global:r,toArray:s,makeIterable:u,each:n,extend:i,__esModule:!0}},{}]},{},[8])(8)})}).call(this,"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],3:[function(e){var t=e("./modules/obj"),n=e("./modules/events"),i=e("./modules/content");i.init(),t.init(),n()},{"./modules/content":4,"./modules/events":6,"./modules/obj":7}],4:[function(e,t){"use strict";var n=window.jQuery||e("domtastic"),i=n("body"),r=!0,o={init:function(){return this.wrapContent()},wrapContent:function(){return i.html('<div id="nice-content">'+i.html()+"</div>"),this.originalHTML=this.currentHTML=this.getHTML(),this.makeEditable(i)},makeEditable:function(e){return e.attr("contenteditable",!0)},removeNice:function(){i.html(n("#nice-content").html()).removeAttr("contenteditable")},getHTML:function(){var e=n("#nice-content").html();return e.trim().replace(/>\s+</g,"><").replace(/></g,">\n\n<")},setHTML:function(e){return n("#nice-content").html(e)},toggleHTML:function(){r=this.getHTML()===this.originalHTML?!0:!1,r||(this.currentHTML=this.getHTML());var e=r?this.currentHTML:this.originalHTML;this.setHTML(e)},getSelection:function(){var e;document.selection?(e=document.body.createTextRange(),e.moveToElementText(document.getElementById("nice-pre")),e.select()):window.getSelection&&(e=document.createRange(),e.selectNode(document.getElementById("nice-pre")),window.getSelection().addRange(e))},originalHTML:"",currentHTML:""};t.exports=o},{domtastic:2}],5:[function(e,t){"use strict";var n=window.jQuey||e("domtastic"),i=e("diff"),r=e("./content"),o={init:function(){var e=i.diffLines(r.originalHTML,r.getHTML());this.populateDiff(e)},populateDiff:function(e){var t,i,r,o=n("#nice-pre").html("");e.forEach(function(e){(e.added||e.removed)&&(t=e.added?"green":e.removed?"red":"grey",i=e.added?"is-added":e.removed?"is-removed":"",r=document.createElement("span"),r.style.color=t,r.setAttribute("class",i),r.appendChild(document.createTextNode(e.value)),o.append(r))})}};t.exports=o},{"./content":4,diff:1,domtastic:2}],6:[function(e,t){"use strict";var n=window.jQuery||e("domtastic"),i=e("./diff"),r=e("./content"),o=function(){n("#nice-min").on("click",function(e){e.preventDefault(),n("#nice-obj").toggleClass("is-min")}),n("#nice-off").on("click",function(e){e.preventDefault(),r.removeNice()}),n("#nice-diff").on("click",function(e){e.preventDefault(),n("#nice-pre").toggleClass("is-active"),i.init()}),n("#nice-toggle").on("click",function(e){e.preventDefault(),r.toggleHTML()}),n("#nice-pre").on("click",function(e){e.preventDefault(),r.getSelection()})};t.exports=o},{"./content":4,"./diff":5,domtastic:2}],7:[function(e,t){"use strict";var n=e("./template"),i=document.getElementsByTagName("body")[0],r=document.getElementsByTagName("head")[0],o={init:function(){this.createObj()},createObj:function(){var e=document.createElement("div");e.setAttribute("id","nice-obj"),e.setAttribute("contenteditable",!1),e.setAttribute("class","is-min"),e.innerHTML=n,this.style(e)},style:function(e){var t=document.createElement("link");t.setAttribute("rel","stylesheet"),t.setAttribute("href","https://seethroughtrees.github.io/inline-copy-editor/index.css"),t.setAttribute("type","text/css"),r.appendChild(t),this.append(e)},append:function(e){i.appendChild(e)}};t.exports=o},{"./template":8}],8:[function(e,t){"use strict";var n='<ul id="nice-nav">';n+='<li id="nice-title" title="Go To Homepage">NICE</li>',n+='<li id="nice-min" title="Minimize NICE"><span></span></li>',n+='<li id="nice-off" title="Turn off NICE"></li>',n+='<li id="nice-diff" title="See Diff"></li>',n+='<li id="nice-toggle" title="Toggle Original"></li>',n+="</ul>",n+='<pre id="nice-pre"></pre>',t.exports=n},{}]},{},[3]);