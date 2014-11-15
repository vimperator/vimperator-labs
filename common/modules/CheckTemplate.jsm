// vim: ft=javascript

var EXPORTED_SYMBOLS = ["isSupport"];

try {
    var isSupport = eval("((a,b)=>a.length)`${1}` === 2");
} catch (ex) {
    Components.utils.reportError(ex);
    isSupport = false;
}
