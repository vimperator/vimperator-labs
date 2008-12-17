
(function () {
    const modules = {};
    const BASE = "chrome://liberator/content/";

    modules.modules = modules;

    const loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
    function load(script)
    {
        for (let [i, base] in Iterator(prefix))
        {
            try
            {
                loader.loadSubScript(base + script, modules)
                return;
            }
            catch (e)
            {
                if (i + 1 < prefix.length)
                    continue;
                if (Cu.reportError)
                    Cu.reportError(e);
                dump("liberator: Loading script " + script + ": " + e + "\n");
            }
        }
    }

    Cu.import("resource://liberator/storage.jsm", modules);

    let prefix = [BASE];

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

    prefix.unshift("chrome://" + modules.config.name.toLowerCase() + "/content/");
    if (modules.config.scripts)
        modules.config.scripts.forEach(load);

})()

// vim: set fdm=marker sw=4 ts=4 et:
