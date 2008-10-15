
(function () {
    const modules = {};
    const BASE = "chrome://liberator/content/";

    modules.modules = modules;

    var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                           .getService(Components.interfaces.mozIJSSubScriptLoader);
    function load(script) {
        try
        {
            loader.loadSubScript(BASE + script, modules)
        }
        catch (e)
        {
            if (Components.utils.reportError)
                Components.utils.reportError(e);
            dump("liberator: Loading script " + script + ": " + e + "\n");
        }
    }

    Components.utils.import("resource://liberator/storage.jsm", modules);

    ["liberator.js",
     "config.js",
     "buffer.js",
     "commands.js",
     "completion.js",
     "editor.js",
     "events.js",
     "find.js",
     "hints.js",
     "io.js",
     "mappings.js",
     "modes.js",
     "options.js",
     "template.js",
     "ui.js",
     "util.js"].forEach(load);
    modules.config.scripts.forEach(load);

})()

