// Copyright (c) 2009 by Kris Maglione <maglione.k@gmail.com>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

const ModuleBase = Class("ModuleBase", { requires: [] });
function Module(name, inst, clas, moduleInit) {
    var base = ModuleBase;
    if (callable(inst))
        base = Array.splice(arguments, 1, 1)[0]
    const module = Class(name, base, inst, clas);
    module.INIT = moduleInit || {};
    module.requires = inst.requires || [];
    Module.list.push(module);
    Module.constructors[name] = module;
    return module;
}
Module.list = [];
Module.constructors = {};

window.addEventListener("load", function () {
    function dump(str) window.dump(String.replace(str, /\n?$/, "\n").replace(/^/m, Config.prototype.name.toLowerCase() + ": "));
    const start = Date.now();
    const deferredInit = { load: [] };
    const seen = set();

    function load(module, prereq) {
        try {
            if (module.name in modules)
                return;
            if (module.name in seen)
                throw Error("Module dependency loop.");
            set.add(seen, module.name);

            for (let dep in values(module.requires))
                load(Module.constructors[dep], module.name);

            dump("Load" + (isstring(prereq) ? " " + prereq + " dependency: " : ": ") + module.name);
            modules[module.name] = module();

            function init(mod, module)
                function () module.INIT[mod].call(modules[module.name], modules[mod]);
            for (let [mod, ] in iter(module.INIT))
                try {
                    if (mod in modules)
                        init(mod, module)();
                    else {
                        deferredInit[mod] = deferredInit[mod] || [];
                        deferredInit[mod].push(init(mod, module));
                    }
                }
                catch(e) {
                    if (modules.liberator)
                        liberator.reportError(e);
                }
            for (let [, fn] in iter(deferredInit[module.name] || []))
                fn();
        }
        catch (e) {
            dump("Loading " + (module && module.name) + ": " + e);
            if (e.stack)
                dump(e.stack);
        }
    }
    Module.list.forEach(load);
    deferredInit['load'].forEach(call)

    for (let module in values(Module.list))
        delete module.INIT;

    dump("Loaded in " + (Date.now() - start) + "ms\n");
}, false);

window.addEventListener("unload", function () {
    for (let [, mod] in iter(modules))
        if (mod instanceof ModuleBase && 'destroy' in mod)
            mod.destroy();
}, false);

// vim: set fdm=marker sw=4 ts=4 et:
