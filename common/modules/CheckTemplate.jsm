// vim: ft=javascript
// TODO: delete me when minVersion is greater than 34

var EXPORTED_SYMBOLS = ["isSupport"];

try {
    var isSupport = eval("((a,b)=>a.length)`${1}` === 2");
} catch (ex) {
    Components.utils.reportError(ex);
    isSupport = false;
}
