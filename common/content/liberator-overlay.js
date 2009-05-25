
(function () {
    const modules = {};
    const BASE = "chrome://liberator/content/";

    modules.modules = modules;

    const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                                     .getService(Components.interfaces.mozIJSSubScriptLoader);
    function load(script)
    {
        for (let [i, base] in Iterator(prefix))
        {
            try
            {
                loader.loadSubScript(base + script, modules);
                return;
            }
            catch (e)
            {
                if (i + 1 < prefix.length)
                    continue;
                if (Components.utils.reportError)
                    Components.utils.reportError(e);
                dump("liberator: Loading script " + script + ": " + e + "\n");
            }
        }
    }

    Components.utils.import("resource://liberator/storage.jsm", modules);

    let prefix = [BASE];

    ["services.js",
     "liberator.js",
     "configbase.js",
     "config.js"].forEach(load);
    modules.config.__proto__ = modules.configbase;

    ["util.js",
     "style.js",
     "buffer.js",
     "commands.js",
     "completion.js",
     "editor.js",
     "events.js",
     "finder.js",
     "hints.js",
     "io.js",
     "mappings.js",
     "modes.js",
     "options.js",
     "template.js",
     "ui.js"].forEach(load);

    prefix.unshift("chrome://" + modules.config.name.toLowerCase() + "/content/");
    modules.config.scripts.forEach(load);

})()

// vim: set fdm=marker sw=4 ts=4 et:
