// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

// TODO: Clean this up.

const JavaScript = Module("javascript", {
    init: function () {
        this._stack = [];
        this._functions = [];
        this._top = {};  // The element on the top of the stack.
        this._last = ""; // The last opening char pushed onto the stack.
        this._lastNonwhite = ""; // Last non-whitespace character we saw.
        this._lastChar = "";     // Last character we saw, used for \ escaping quotes.
        this._str = "";

        this._lastIdx = 0;

        this._cacheKey = null;
    },

    get completers() JavaScript.completers, // For backward compatibility

    // Some object members are only accessible as function calls
    getKey: function (obj, key) {
        try {
            return obj[key];
        }
        catch (e) {
            return undefined;
        }
    },

    iter: function iter(obj, toplevel) {
        toplevel = !!toplevel;
        let seen = {};

        try {
            let orig = obj;

            function iterObj(obj, toplevel) {
                function isXPCNativeWrapper(obj) isobject(obj) && XPCNativeWrapper.unwrap(obj) !== obj

                if (isXPCNativeWrapper(obj)) {
                    if (toplevel) {
                        yield {get wrappedJSObject() 0};
                    }
                    // according to http://getfirebug.com/wiki/index.php/Using_win.wrappedJSObject
                    // using a wrappedJSObject itself is safe, as potential functions are always
                    // run in page context, not in chrome context.
                    // However, as we really need to make sure, values coming
                    // from content scope are never used in unsecured eval(),
                    // we dissallow unwrapping objects for now, unless the user
                    // uses an (undocumented) option 'unwrapjsobjects'
                    else if (options["inspectcontentobjects"]) {
                        obj = obj.wrappedJSObject;
                    }
                }
                if (toplevel)
                    yield obj;
                else
                    for (let o = obj.__proto__; o; o = o.__proto__)
                        yield o;
            }

            for (let obj in iterObj(orig, toplevel)) {
                for (let [, k] in Iterator(Object.getOwnPropertyNames(obj))) {
                    let name = "|" + k;
                    if (name in seen)
                        continue;
                    seen[name] = 1;
                    yield [k, this.getKey(orig, k)];
                }
            }
        }
        catch (ex) {
            // TODO: report error?
        }
    },

    // Search the object for strings starting with @key.
    // If @last is defined, key is a quoted string, it's
    // wrapped in @last after @offset characters are sliced
    // off of it and it's quoted.
    objectKeys: function objectKeys(obj, toplevel) {
        // Things we can dereference
        if (["object", "string", "function"].indexOf(typeof obj) == -1)
            return [];
        if (!obj)
            return [];

        let completions;
        if (modules.isPrototypeOf(obj))
            completions = [v for (v in Iterator(obj))];
        else {
            completions = [k for (k in this.iter(obj, toplevel))];
            if (!toplevel)
                completions = util.Array.uniq(completions, true);
        }

        // Add keys for sorting later.
        // Numbers are parsed to ints.
        // Constants, which should be unsorted, are found and marked null.
        completions.forEach(function (item) {
            let key = item[0];
            if (!isNaN(key))
                key = parseInt(key);
            else if (/^[A-Z_][A-Z0-9_]*$/.test(key))
                key = "";
            item.key = key;
        });

        return completions;
    },

    eval: function eval(arg, key, tmp) {
        let cache = this.context.cache.eval;
        let context = this.context.cache.evalContext;

        if (!key)
            key = arg;
        if (key in cache)
            return cache[key];

        context[JavaScript.EVAL_TMP] = tmp;
        try {
            return cache[key] = liberator.eval(arg, context);
        }
        catch (e) {
            return null;
        }
        finally {
            delete context[JavaScript.EVAL_TMP];
        }
    },

    // Get an element from the stack. If @frame is negative,
    // count from the top of the stack, otherwise, the bottom.
    // If @nth is provided, return the @mth value of element @type
    // of the stack entry at @frame.
    _get: function (frame, nth, type) {
        let a = this._stack[frame >= 0 ? frame : this._stack.length + frame];
        if (type != null)
            a = a[type];
        if (nth == null)
            return a;
        return a[a.length - nth - 1];
    },

    // Push and pop the stack, maintaining references to 'top' and 'last'.
    _push: function push(arg) {
        this._top = {
            offset:     this._i,
            char:       arg,
            statements: [this._i],
            dots:       [],
            fullStatements: [],
            comma:      [],
            functions:  []
        };
        this._last = this._top.char;
        this._stack.push(this._top);
    },

    _pop: function pop(arg) {
        if (this._top.char != arg) {
            this.context.highlight(this._top.offset, this._i - this._top.offset, "SPELLCHECK");
            this.context.highlight(this._top.offset, 1, "FIND");
            throw new Error("Invalid JS");
        }

        if (this._i == this.context.caret - 1)
            this.context.highlight(this._top.offset, 1, "FIND");

        // The closing character of this stack frame will have pushed a new
        // statement, leaving us with an empty statement. This doesn't matter,
        // now, as we simply throw away the frame when we pop it, but it may later.
        if (this._top.statements[this._top.statements.length - 1] == this._i)
            this._top.statements.pop();
        this._top = this._get(-2);
        this._last = this._top.char;
        let ret = this._stack.pop();
        return ret;
    },

    _buildStack: function (filter) {
        let self = this;

        // Todo: Fix these one-letter variable names.
        this._i = 0;
        this._c = "";     // Current index and character, respectively.

        // Reuse the old stack.
        if (this._str && filter.substr(0, this._str.length) == this._str) {
            this._i = this._str.length;
            if (this.popStatement)
                this._top.statements.pop();
        }
        else {
            this._stack = [];
            this._functions = [];
            this._push("#root");
        }

        // Build a parse stack, discarding entries as opening characters
        // match closing characters. The stack is walked from the top entry
        // and down as many levels as it takes us to figure out what it is
        // that we're completing.
        this._str = filter;
        let length = this._str.length;
        for (; this._i < length; this._lastChar = this._c, this._i++) {
            this._c = this._str[this._i];
            if (this._last == '"' || this._last == "'" || this._last == "/") {
                if (this._lastChar == "\\") { // Escape. Skip the next char, whatever it may be.
                    this._c = "";
                    this._i++;
                }
                else if (this._c == this._last)
                    this._pop(this._c);
            }
            else {
                // A word character following a non-word character, or simply a non-word
                // character. Start a new statement.
                if (/[a-zA-Z_$]/.test(this._c) && !/[\w$]/.test(this._lastChar) || !/[\w\s$]/.test(this._c))
                    this._top.statements.push(this._i);

                // A "." or a "[" dereferences the last "statement" and effectively
                // joins it to this logical statement.
                if ((this._c == "." || this._c == "[") && /[\w$\])"']/.test(this._lastNonwhite)
                ||  this._lastNonwhite == "." && /[a-zA-Z_$]/.test(this._c))
                        this._top.statements.pop();

                switch (this._c) {
                case "(":
                    // Function call, or if/while/for/...
                    if (/[\w$]/.test(this._lastNonwhite)) {
                        this._functions.push(this._i);
                        this._top.functions.push(this._i);
                        this._top.statements.pop();
                    }
                case '"':
                case "'":
                case "/":
                case "{":
                    this._push(this._c);
                    break;
                case "[":
                    this._push(this._c);
                    break;
                case ".":
                    this._top.dots.push(this._i);
                    break;
                case ")": this._pop("("); break;
                case "]": this._pop("["); break;
                case "}": this._pop("{"); // Fallthrough
                case ";":
                    this._top.fullStatements.push(this._i);
                    break;
                case ",":
                    this._top.comma.push(this._i);
                    break;
                }

                if (/\S/.test(this._c))
                    this._lastNonwhite = this._c;
            }
        }

        this.popStatement = false;
        if (!/[\w$]/.test(this._lastChar) && this._lastNonwhite != ".") {
            this.popStatement = true;
            this._top.statements.push(this._i);
        }

        this._lastIdx = this._i;
    },

    // Don't eval any function calls unless the user presses tab.
    _checkFunction: function (start, end, key) {
        let res = this._functions.some(function (idx) idx >= start && idx < end);
        if (!res || this.context.tabPressed || key in this.cache.eval)
            return false;
        this.context.waitingForTab = true;
        return true;
    },

    // For each DOT in a statement, prefix it with TMP, eval it,
    // and save the result back to TMP. The point of this is to
    // cache the entire path through an object chain, mainly in
    // the presence of function calls. There are drawbacks. For
    // instance, if the value of a variable changes in the course
    // of inputting a command (let foo=bar; frob(foo); foo=foo.bar; ...),
    // we'll still use the old value. But, it's worth it.
    _getObj: function (frame, stop) {
        let statement = this._get(frame, 0, "statements") || 0; // Current statement.
        let prev = statement;
        let obj;
        let cacheKey;
        for (let [, dot] in Iterator(this._get(frame).dots.concat(stop))) {
            if (dot < statement)
                continue;
            if (dot > stop || dot <= prev)
                break;
            let s = this._str.substring(prev, dot);

            if (prev != statement)
                s = JavaScript.EVAL_TMP + "." + s;
            cacheKey = this._str.substring(statement, dot);

            if (this._checkFunction(prev, dot, cacheKey))
                return [];

            prev = dot + 1;
            obj = this.eval(s, cacheKey, obj);
        }
        return [[obj, cacheKey]];
    },

    _getObjKey: function (frame) {
        let dot = this._get(frame, 0, "dots") || -1; // Last dot in frame.
        let statement = this._get(frame, 0, "statements") || 0; // Current statement.
        let end = (frame == -1 ? this._lastIdx : this._get(frame + 1).offset);

        this._cacheKey = null;
        let obj = [[this.cache.evalContext, "Local Variables"],
                   [userContext, "Global Variables"],
                   [modules, "modules"],
                   [window, "window"]]; // Default objects;
        // Is this an object dereference?
        if (dot < statement) // No.
            dot = statement - 1;
        else // Yes. Set the object to the string before the dot.
            obj = this._getObj(frame, dot);

        let [, space, key] = this._str.substring(dot + 1, end).match(/^(\s*)(.*)/);
        return [dot + 1 + space.length, obj, key];
    },

    _fill: function (context, obj, name, compl, anchored, key, last, offset) {
        context.title = [name];
        context.anchored = anchored;
        context.filter = key;
        context.itemCache = context.parent.itemCache;
        context.key = name;

        if (last != null)
            context.quote = [last, function (text) util.escapeString(text.substr(offset), ""), last];
        else // We're not looking for a quoted string, so filter out anything that's not a valid identifier
            context.filters.push(function (item) /^[a-zA-Z_$][\w$]*$/.test(item.text));

        compl.call(self, context, obj);
    },

    _complete: function (objects, key, compl, string, last) {
        const self = this;
        let orig = compl;
        if (!compl) {
            compl = function (context, obj, recurse) {
                context.process = [null, function highlight(item, v) template.highlight(v, true)];
                // Sort in a logical fashion for object keys:
                //  Numbers are sorted as numbers, rather than strings, and appear first.
                //  Constants are unsorted, and appear before other non-null strings.
                //  Other strings are sorted in the default manner.
                let compare = context.compare;
                function isnan(item) item != '' && isNaN(item);
                context.compare = function (a, b) {
                    if (!isnan(a.item.key) && !isnan(b.item.key))
                        return a.item.key - b.item.key;
                    return isnan(b.item.key) - isnan(a.item.key) || compare(a, b);
                };
                if (!context.anchored) // We've already listed anchored matches, so don't list them again here.
                    context.filters.push(function (item) util.compareIgnoreCase(item.text.substr(0, this.filter.length), this.filter));
                if (obj == self.cache.evalContext)
                    context.regenerate = true;
                context.generate = function () self.objectKeys(obj, !recurse);
            };
        }
        // TODO: Make this a generic completion helper function.
        let filter = key + (string || "");
        for (let [, obj] in Iterator(objects)) {
            this.context.fork(obj[1], this._top.offset, this, this._fill,
                obj[0], obj[1], compl,
                true, filter, last, key.length);
        }

        if (orig)
            return;

        for (let [, obj] in Iterator(objects)) {
            let name = obj[1] + " (prototypes)";
            this.context.fork(name, this._top.offset, this, this._fill,
                obj[0], name, function (a, b) compl(a, b, true),
                true, filter, last, key.length);
        }

        for (let [, obj] in Iterator(objects)) {
            let name = obj[1] + " (substrings)";
            this.context.fork(name, this._top.offset, this, this._fill,
                obj[0], name, compl,
                false, filter, last, key.length);
        }

        for (let [, obj] in Iterator(objects)) {
            let name = obj[1] + " (prototype substrings)";
            this.context.fork(name, this._top.offset, this, this._fill,
                obj[0], name, function (a, b) compl(a, b, true),
                false, filter, last, key.length);
        }
    },

    _getKey: function () {
        if (this._last == "")
            return "";
        // After the opening [ upto the opening ", plus '' to take care of any operators before it
        let key = this._str.substring(this._get(-2, 0, "statements"), this._get(-1, null, "offset")) + "''";
        // Now eval the key, to process any referenced variables.
        return this.eval(key);
    },

    get cache() this.context.cache,

    complete: function _complete(context) {
        const self = this;
        this.context = context;

        try {
            this._buildStack.call(this, context.filter);
        }
        catch (e) {
            if (e.message != "Invalid JS")
                liberator.echoerr(e);
            this._lastIdx = 0;
            return null;
        }

        this.context.getCache("eval", Object);
        this.context.getCache("evalContext", function () ({ __proto__: userContext }));

        // Okay, have parse stack. Figure out what we're completing.

        // Find any complete statements that we can eval before we eval our object.
        // This allows for things like: let doc = window.content.document; let elem = doc.createElement...; elem.<Tab>
        let prev = 0;
        for (let [, v] in Iterator(this._get(0).fullStatements)) {
            let key = this._str.substring(prev, v + 1);
            if (this._checkFunction(prev, v, key))
                return null;
            this.eval(key);
            prev = v + 1;
        }

        // In a string. Check if we're dereferencing an object.
        // Otherwise, do nothing.
        if (this._last == "'" || this._last == '"') {
            //
            // str = "foo[bar + 'baz"
            // obj = "foo"
            // key = "bar + ''"
            //

            // The top of the stack is the sting we're completing.
            // Wrap it in its delimiters and eval it to process escape sequences.
            let string = this._str.substring(this._get(-1).offset + 1, this._lastIdx);
            string = eval(this._last + string + this._last);

            // Is this an object accessor?
            if (this._get(-2).char == "[") { // Are we inside of []?
                // Stack:
                //  [-1]: "...
                //  [-2]: [...
                //  [-3]: base statement

                // Yes. If the [ starts at the beginning of a logical
                // statement, we're in an array literal, and we're done.
                 if (this._get(-3, 0, "statements") == this._get(-2).offset)
                    return null;

                // Beginning of the statement upto the opening [
                let obj = this._getObj(-3, this._get(-2).offset);

                return this._complete(obj, this._getKey(), null, string, this._last);
            }

            // Is this a function call?
            if (this._get(-2).char == "(") {
                // Stack:
                //  [-1]: "...
                //  [-2]: (...
                //  [-3]: base statement

                // Does the opening "(" mark a function call?
                if (this._get(-3, 0, "functions") != this._get(-2).offset)
                    return null; // No. We're done.

                let [offset, obj, func] = this._getObjKey(-3);
                if (!obj.length)
                    return null;
                obj = obj.slice(0, 1);

                try {
                    var completer = obj[0][0][func].liberatorCompleter;
                }
                catch (e) {}
                if (!completer)
                    completer = JavaScript.completers[func];
                if (!completer)
                    return null;

                // Split up the arguments
                let prev = this._get(-2).offset;
                let args = [];
                for (let [i, idx] in Iterator(this._get(-2).comma)) {
                    let arg = this._str.substring(prev + 1, idx);
                    prev = idx;
                    util.memoize(args, i, function () self.eval(arg));
                }
                let key = this._getKey();
                args.push(key + string);

                compl = function (context, obj) {
                    let res = completer.call(self, context, func, obj, args);
                    if (res)
                        context.completions = res;
                };

                obj[0][1] += "." + func + "(... [" + args.length + "]";
                return this._complete(obj, key, compl, string, this._last);
            }

            // In a string that's not an obj key or a function arg.
            // Nothing to do.
            return null;
        }

        //
        // str = "foo.bar.baz"
        // obj = "foo.bar"
        // key = "baz"
        //
        // str = "foo"
        // obj = [modules, window]
        // key = "foo"
        //

        let [offset, obj, key] = this._getObjKey(-1);

        // Wait for a keypress before completing the default objects.
        if (!this.context.tabPressed && key == "" && obj.length > 1) {
            this.context.waitingForTab = true;
            this.context.message = "Waiting for key press";
            return null;
        }

        if (!/^(?:[a-zA-Z_$][\w$]*)?$/.test(key))
            return null; // Not a word. Forget it. Can this even happen?

        try { // FIXME
            var o = this._top.offset;
            this._top.offset = offset;
            return this._complete(obj, key);
        }
        finally {
            this._top.offset = o;
        }
        return null;
    }
}, {
    EVAL_TMP: "__liberator_eval_tmp",

    /**
     * A map of argument completion functions for named methods. The
     * signature and specification of the completion function
     * are fairly complex and yet undocumented.
     *
     * @see JavaScript.setCompleter
     */
    completers: {},

    /**
     * Installs argument string completers for a set of functions.
     * The second argument is an array of functions (or null
     * values), each corresponding the argument of the same index.
     * Each provided completion function receives as arguments a
     * CompletionContext, the 'this' object of the method, and an
     * array of values for the preceding arguments.
     *
     * It is important to note that values in the arguments array
     * provided to the completers are lazily evaluated the first
     * time they are accessed, so they should be accessed
     * judiciously.
     *
     * @param {function|function[]} funcs The functions for which to
     *      install the completers.
     * @param {function[]} completers An array of completer
     *      functions.
     */
    setCompleter: function (funcs, completers) {
        funcs = Array.concat(funcs);
        for (let [, func] in Iterator(funcs)) {
            func.liberatorCompleter = function (context, func, obj, args) {
                let completer = completers[args.length - 1];
                if (!completer)
                    return [];
                return completer.call(this, context, obj, args);
            };
        }
    }
}, {
    completion: function () {
        completion.javascript = this.closure.complete;
        completion.javascriptCompleter = JavaScript; // Backwards compatibility.
    },
    options: function () {
        options.add(["inspectcontentobjects"],
            "Allow completion of JavaScript objects coming from web content. POSSIBLY INSECURE!",
            "boolean", false);
    }
})
