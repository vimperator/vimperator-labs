
(function () {
    const modules = {};
    const BASE = "chrome://liberator/content/";

    modules.modules = modules;

    var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                           .getService(Components.interfaces.mozIJSSubScriptLoader);
    function load(script, i)
    {
        try
        {
            loader.loadSubScript(BASE + script, modules)
        }
        catch (e)
        {
            if (Components.utils.reportError)
                Components.utils.reportError(e);
            dump("liberator: Loading script " + script + ": " + e + "\n");
            if (!i || i < 3)
                return load(script, i + 1); // Sometimes loading (seemingly randomly) fails
        }
    }

    Components.utils.import("resource://liberator/storage.jsm", modules);

    ["liberator.js",
     "config.js",
     "util.js",
     "style.js",
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
     "ui.js"].forEach(load);

    if (modules.config.scripts)
        modules.config.scripts.forEach(load);

})()

// vim: set fdm=marker sw=4 ts=4 et:
