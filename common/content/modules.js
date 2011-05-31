// Copyright (c) 2009 by Kris Maglione <maglione.k@gmail.com>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/**
 * @class ModuleBase
 * The base class for all modules.
 */
const ModuleBase = Class("ModuleBase", {
    /**
     * @property {[string]} A list of module prerequisites which
     * must be initialized before this module is loaded.
     */
    requires: [],

    toString: function () "[module " + this.constructor.name + "]"
});

/**
 * @constructor Module
 *
 * Constructs a new ModuleBase class and makes arrangements for its
 * initialization. Arguments marked as optional must be either
 * entirely elided, or they must have the exact type specified.
 * Loading semantics are as follows:
 *
 *  - A module is guaranteed not to be initialized before any of its
 *    prerequisites as listed in its {@see ModuleBase#requires} member.
 *  - A module is considered initialized once it's been instantiated,
 *    its {@see Class#init} method has been called, and its
 *    instance has been installed into the top-level {@see modules}
 *    object.
 *  - Once the module has been initialized, its module-dependent
 *    initialization functions will be called as described hereafter.
 * @param {string} name The module's name as it will appear in the
 *     top-level {@see modules} object.
 * @param {ModuleBase} base The base class for this module.
 *     @optional
 * @param {Object} prototype The prototype for instances of this
 *     object. The object itself is copied and not used as a prototype
 *     directly.
 * @param {Object} classProperties The class properties for the new
 *     module constructor.
 *     @optional
 * @param {Object} moduleInit The module initialization functions
 *     for the new module. Each function is called as soon as the named module
 *     has been initialized, but after the module itself. The constructors are
 *     guaranteed to be called in the same order that the dependent modules
 *     were initialized.
 *     @optional
 *
 * @returns {function} The constructor for the resulting module.
 */
function Module(name, prototype, classProperties, moduleInit) {
    var base = ModuleBase;
    if (callable(prototype))
        base = Array.splice(arguments, 1, 1)[0];
    const module = Class(name, base, prototype, classProperties);
    module.INIT = moduleInit || {};
    module.requires = prototype.requires || [];
    Module.list.push(module);
    Module.constructors[name] = module;
    return module;
}
Module.list = [];
Module.constructors = {};

window.addEventListener("load", function () {
    window.removeEventListener("load", arguments.callee, false);

    function dump(str) window.dump(String.replace(str, /\n?$/, "\n").replace(/^/m, Config.prototype.name.toLowerCase() + ": "));
    const start = Date.now();
    const deferredInit = { load: [] };
    const seen = set();
    const loaded = [];

    function load(module, prereq) {
        try {
            if (module.name in modules)
                return;
            if (module.name in seen)
                throw Error("Module dependency loop");
            set.add(seen, module.name);

            for (let dep in values(module.requires))
                load(Module.constructors[dep], module.name);

            dump("Load" + (isstring(prereq) ? " " + prereq + " dependency: " : ": ") + module.name);
            modules[module.name] = module();
            loaded.push(module.name);

            function init(mod, module)
                function () module.INIT[mod].call(modules[module.name], modules[mod]);
            for (let mod in values(loaded)) {
                try {
                    if (mod in module.INIT)
                        init(mod, module)();
                    delete module.INIT[mod];
                }
                catch (e) {
                    if (modules.liberator)
                        liberator.echoerr(e);
                }
            }
            for (let mod in keys(module.INIT)) {
                deferredInit[mod] = deferredInit[mod] || [];
                deferredInit[mod].push(init(mod, module));
            }
            for (let [, fn] in iter(deferredInit[module.name] || []))
                fn();
        }
        catch (e) {
            dump("Loading " + (module && module.name) + ": " + e + "\n");
            if (e.stack)
                dump(e.stack);
        }
    }
    Module.list.forEach(load);
    deferredInit["load"].forEach(call);

    for (let module in values(Module.list))
        delete module.INIT;

    dump("Loaded in " + (Date.now() - start) + "ms\n");
}, false);

window.addEventListener("unload", function () {
    window.removeEventListener("unload", arguments.callee, false);
    for (let [, mod] in iter(modules))
        if (mod instanceof ModuleBase && "destroy" in mod)
            mod.destroy();
}, false);

// vim: set fdm=marker sw=4 ts=4 et:
