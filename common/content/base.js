// Copyright (c) 2009 by Kris Maglione <maglione.k@gmail.com>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

function array(obj) {
    if (isgenerator(obj))
        obj = [k for (k in obj)];
    else if (obj.length)
        obj = Array.slice(obj);
    return util.Array(obj);
}

function keys(obj) {
    if ('__iterator__' in obj) {
        var iter = obj.__iterator__;
        yield '__iterator__';
        // This is dangerous, but necessary.
        delete obj.__iterator__;
    }
    for (var k in obj)
        if (obj.hasOwnProperty(k))
            yield k;
    if (iter !== undefined)
        obj.__iterator__ = iter;
}
function values(obj) {
    for (var k in obj)
        if (obj.hasOwnProperty(k))
            yield obj[k];
}
function foreach(iter, fn, self) {
    for (let val in iter)
        fn.call(self, val);
}

function dict(ary) {
    var obj = {};
    for (var i=0; i < ary.length; i++) {
        var val = ary[i];
        obj[val[0]] = val[1];
    }
    return obj;
}

function set(ary) {
    var obj = {}
    if (ary)
        for (var i=0; i < ary.length; i++)
            obj[ary[i]] = true;
    return obj;
}
set.add = function(set, key) { set[key] = true }
set.remove = function(set, key) { delete set[key] }

function iter(obj) {
    if (obj instanceof Ci.nsISimpleEnumerator)
        return (function () {
            while (obj.hasMoreElements())
                yield obj.getNext();
        })()
    if (isinstance(obj, [Ci.nsIStringEnumerator, Ci.nsIUTF8StringEnumerator]))
        return (function () {
            while (obj.hasMore())
                yield obj.getNext();
        })();
    if (isinstance(obj, Ci.nsIDOMNodeIterator))
        return (function () {
            try {
                while (true)
                    yield obj.nextNode()
            }
            catch (e) {}
        })();
    if (isinstance(obj, [HTMLCollection, NodeList]))
        return util.Array.iteritems(obj);
    if (obj instanceof NamedNodeMap)
        return (function () {
            for (let i=0; i < obj.length; i++)
                yield [obj.name, obj]
        })();
    return Iterator(obj);
}

function issubclass(targ, src) {
    return src === targ ||
        targ && typeof targ === "function" && targ.prototype instanceof src;
}

function isinstance(targ, src) {
    const types = {
        boolean: Boolean,
        string: String,
        function: Function,
        number: Number,
    }
    src = Array.concat(src);
    for (var i=0; i < src.length; i++) {
        if (targ instanceof src[i])
            return true;
        var type = types[typeof targ];
        if (type && issubclass(src[i], type))
            return true;
    }
    return false;
}

function isobject(obj) {
    return typeof obj === "object" && obj != null;
}

function isarray(obj) {
    return Object.prototype.toString(obj) == "[object Array]";
}

function isgenerator(val) {
    return Object.prototype.toString(obj) == "[object Generator]";
}

function isstring(val) {
    return typeof val === "string" || val instanceof String;
}

function callable(val) {
    return typeof val === "function";
}

function call(fn) {
    fn.apply(arguments[1], Array.slice(arguments, 2));
    return fn;
}

function curry(fn, length, acc) {
    if (length == null)
        length = fn.length;
    if (length == 0)
        return fn;

    /* Close over function with 'this' */
    function close(self, fn) function () fn.apply(self, Array.slice(arguments));

    let first = (arguments.length < 3);
    if (acc == null)
        acc = [];

    return function() {
        let args = acc.concat(Array.slice(arguments));

        /* The curried result should preserve 'this' */
        if (arguments.length == 0)
            return close(this, arguments.callee);

        if (args.length >= length)
            return fn.apply(this, args);

        if (first)
            fn = close(this, fn);
        return curry(fn, length, args);
    }
}

function update(targ) {
    for (let i=1; i < arguments.length; i++) {
        let src = arguments[i];
        foreach(keys(src || {}), function(k) {
            var get = src.__lookupGetter__(k),
                set = src.__lookupSetter__(k);
            if (!get && !set) {
                var v = src[k];
                targ[k] = v;
                if (targ.__proto__ && callable(v)) {
                    v.superapply = function(self, args) {
                        return targ.__proto__[k].apply(self, args);
                    }
                    v.supercall = function(self) {
                        return v.superapply(self, Array.slice(arguments, 1));
                    }
                }
            }
            if (get)
                targ.__defineGetter__(k, get);
            if (set)
                targ.__defineSetter__(k, set);
        });
    }
    return targ;
}

function extend(subc, superc, overrides) {
    subc.prototype = {};
    update(subc.prototype, overrides);
    // This is unduly expensive.
    subc.prototype.__proto__ = superc.prototype;

    subc.superclass = superc.prototype;
    subc.prototype.constructor = subc;
    subc.prototype.__class__ = subc;

    if (superc.prototype.constructor === Object.prototype.constructor)
        superc.prototype.constructor = superc;
}

function Class() {
    function constructor() {
        let self = {
            __proto__: Constructor.prototype,
            constructor: Constructor,
            get closure() {
                delete this.closure;
                const self = this;
                return this.closure = dict([k for (k in this) if (!self.__lookupGetter__(k) && callable(self[k]))].map(
                        function (k) [k, function () self[k].apply(self, arguments)]));
            }
        };
        var res = self.init.apply(self, arguments);
        return res !== undefined ? res : self
    }

    var args = Array.slice(arguments);
    if (isstring(args[0]))
        var name = args.shift();
    var superclass = Class;
    if (callable(args[0]))
        superclass = args.shift();

    var Constructor = eval("(function " + (name || superclass.name) +
            String.substr(constructor, 20) + ")");

    if (!('init' in superclass.prototype)) {
        var superc = superclass;
        superclass = function Shim() {}
        extend(superclass, superc, {
            init: superc,
        });
    }

    extend(Constructor, superclass, args[0]);
    update(Constructor, args[1]);
    args = args.slice(2);
    Array.forEach(args, function(obj) {
        if (callable(obj))
            obj = obj.prototype;
        update(Constructor.prototype, obj);
    });
    return Constructor;
}
Class.toString = function () "[class " + this.constructor.name + "]",
Class.prototype = {
    init: function() {},
    toString: function () "[instance " + this.constructor.name + "]",
};

const Struct = Class("Struct", {
    init: function () {
        let args = Array.slice(arguments);
        this.__defineGetter__("length", function () args.length);
        this.__defineGetter__("members", function () args.slice());
        for (let arg in Iterator(args)) {
            let [i, name] = arg;
            this.__defineGetter__(name, function () this[i]);
            this.__defineSetter__(name, function (val) { this[i] = val; });
        }
        function Struct() {
            let self = this instanceof arguments.callee ? this : new arguments.callee();
            //for (let [k, v] in Iterator(Array.slice(arguments))) // That is makes using struct twice as slow as the following code:
            for (let i = 0; i < arguments.length; i++) {
                if (arguments[i] != undefined)
                    self[i] = arguments[i];
            }
            return self;
        }
        Struct.prototype = this;
        Struct.defaultValue = function (key, val) {
            let i = args.indexOf(key);
            Struct.prototype.__defineGetter__(i, function () (this[i] = val.call(this), this[i])); // Kludge for FF 3.0
            Struct.prototype.__defineSetter__(i, function (val) {
                let value = val;
                this.__defineGetter__(i, function () value);
                this.__defineSetter__(i, function (val) { value = val });
            });
        };
        return this.constructor = Struct;
    },

    clone: function clone() {
        return this.constructor.apply(null, this.slice());
    },
    // Iterator over our named members
    __iterator__: function () {
        let self = this;
        return ([v, self[v]] for ([k, v] in Iterator(self.members)))
    }
});
// Add no-sideeffect array methods. Can't set new Array() as the prototype or
// get length() won't work.
for (let [, k] in Iterator(["concat", "every", "filter", "forEach", "indexOf", "join", "lastIndexOf",
                            "map", "reduce", "reduceRight", "reverse", "slice", "some", "sort"]))
    Struct.prototype[k] = Array.prototype[k];

// vim: set fdm=marker sw=4 ts=4 et:
