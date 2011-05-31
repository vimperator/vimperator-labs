// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

/**
 * Creates a new completion context.
 *
 * @class A class to provide contexts for command completion.
 * Manages the filtering and formatting of completions, and keeps
 * track of the positions and quoting of replacement text. Allows for
 * the creation of sub-contexts with different headers and quoting
 * rules.
 *
 * @param {HTMLInputElement} input The editor for which completion is
 *     intended. May be a {CompletionContext} when forking a context,
 *     or a {string} when creating a new one.
 * @param {string} name The name of this context. Used when the
 *     context is forked.
 * @param {number} offset The offset from the parent context.
 * @author Kris Maglione <maglione.k@gmail.com>
 * @constructor
 */
const CompletionContext = Class("CompletionContext", {
    init: function (input, name, offset) {
        if (!name)
            name = "";

        let self = this;
        if (input instanceof this.constructor) {
            let parent = input;
            name = parent.name + "/" + name;
            this.contexts = parent.contexts;
            if (name in this.contexts)
                self = this.contexts[name];
            else
                self.contexts[name] = this;

            /**
             * @property {CompletionContext} This context's parent. {null} when
             *     this is a top-level context.
             */
            self.parent = parent;

            ["filters", "keys", "title", "quote"].forEach(function (key)
                self[key] = parent[key] && util.cloneObject(parent[key]));
            ["anchored", "compare", "editor", "inputField", "_filter", "filterFunc", "keys", "_process", "top"].forEach(function (key)
                self[key] = parent[key]);

            self.__defineGetter__("value", function () this.top.value);

            self.offset = parent.offset;
            self.advance(offset);

            /**
             * @property {boolean} Specifies that this context is not finished
             *     generating results.
             * @default false
             */
            self.incomplete = false;
            self.message = null;
            /**
             * @property {boolean} Specifies that this context is waiting for the
             *     user to press <Tab>. Useful when fetching completions could be
             *     dangerous or slow, and the user has enabled autocomplete.
             */
            self.waitingForTab = false;

            delete self._generate;
            delete self._ignoreCase;
            if (self != this)
                return self;
            ["_caret", "contextList", "maxItems", "onUpdate", "selectionTypes", "tabPressed", "updateAsync", "value"].forEach(function (key) {
                self.__defineGetter__(key, function () this.top[key]);
                self.__defineSetter__(key, function (val) this.top[key] = val);
            });
        }
        else {
            if (typeof input == "string")
                this._value = input;
            else {
                this.inputField = input;
                this.editor = input.editor;
            }
            this.compare = function (a, b) String.localeCompare(a.text, b.text);

            /**
             * @property {function} This function is called when we close
             *     a completion window with Esc or Ctrl-c. Usually this callback
             *     is only needed for long, asynchronous completions
             */
            this.cancel = null;
            /**
             * @property {function} The function used to filter the results.
             * @default Selects all results which match every predicate in the
             *     {@link #filters} array.
             */
            this.filterFunc = function (items) {
                    let self = this;
                    return this.filters.
                        reduce(function (res, filter) res.filter(function (item) filter.call(self, item)),
                                items);
            };
            /**
             * @property {Array} An array of predicates on which to filter the
             *     results.
             */
            this.filters = [CompletionContext.Filter.text];
            /**
             * @property {boolean} Specifies whether this context results must
             *     match the filter at the beginning of the string.
             * @default true
             */
            this.anchored = true;
            /**
             * @property {Object} A map of all contexts, keyed on their names.
             *    Names are assigned when a context is forked, with its specified
             *    name appended, after a '/', to its parent's name. May
             *    contain inactive contexts. For active contexts, see
             *    {@link #contextList}.
             */
            this.contexts = { "": this };
            /**
             * @property {Object} A mapping of keys, for {@link #getKey}. Given
             *      { key: value }, getKey(item, key) will return values as such:
             *      if value is a string, it will return item.item[value]. If it's a
             *      function, it will return value(item.item).
             */
            this.keys = { text: 0, description: 1, icon: "icon" };
            /**
             * @property {number} This context's offset from the beginning of
             *     {@link #editor}'s value.
             */
            this.offset = offset || 0;
            /**
             * @property {function} A function which is called when any subcontext
             *     changes its completion list. Only called when
             *     {@link #updateAsync} is true.
             */
            this.onUpdate = function () true;
            /**
             * @property {CompletionContext} The top-level completion context.
             */
            this.top = this;
            this.__defineGetter__("incomplete", function () this.contextList.some(function (c) c.parent && c.incomplete));
            this.__defineGetter__("waitingForTab", function () this.contextList.some(function (c) c.parent && c.waitingForTab));
            this.reset();
        }
        /**
         * @property {Object} A general-purpose store for functions which need to
         *     cache data between calls.
         */
        this.cache = {};
        /**
         * @private
         * @property {Object} A cache for return values of {@link #generate}.
         */
        this.itemCache = {};
        /**
         * @property {string} A key detailing when the cached value of
         *     {@link #generate} may be used. Every call to
         *     {@link #generate} stores its result in {@link #itemCache}.
         *     When itemCache[key] exists, its value is returned, and
         *     {@link #generate} is not called again.
         */
        this.key = "";
        /**
         * @property {string} A message to be shown before any results.
         */
        this.message = null;
        this.name = name || "";
        /** @private */
        this._completions = []; // FIXME
        /**
         * Returns a key, as detailed in {@link #keys}.
         * @function
         */
        this.getKey = function (item, key) (typeof self.keys[key] == "function") ? self.keys[key].call(this, item.item) :
                key in self.keys ? item.item[self.keys[key]]
                                 : item.item[key];
        return this;
    },
    // Temporary
    /**
     * @property {Object}
     *
     * An object describing the results from all sub-contexts. Results are
     * adjusted so that all have the same starting offset.
     *
     * @deprecated
     */
    get allItems() {
        try {
            let self = this;
            let minStart = Math.min.apply(Math, [context.offset for ([k, context] in Iterator(this.contexts)) if (context.items.length && context.hasItems)]);
            if (minStart == Infinity)
                minStart = 0;
            let items = this.contextList.map(function (context) {
                if (!context.hasItems)
                    return [];
                let prefix = self.value.substring(minStart, context.offset);
                return context.items.map(function (item) ({
                    text: prefix + item.text,
                    __proto__: item
                }));
            });
            return { start: minStart, items: util.Array.flatten(items), longestSubstring: this.longestAllSubstring };
        }
        catch (e) {
            liberator.echoerr(e);
            return { start: 0, items: [], longestAllSubstring: "" };
        }
    },
    // Temporary
    get allSubstrings() {
        let contexts = this.contextList.filter(function (c) c.hasItems && c.items.length);
        let minStart = Math.min.apply(Math, contexts.map(function (c) c.offset));
        let lists = contexts.map(function (context) {
            let prefix = context.value.substring(minStart, context.offset);
            return context.substrings.map(function (s) prefix + s);
        });

        let substrings = lists.reduce(
                function (res, list) res.filter(function (str) list.some(function (s) s.substr(0, str.length) == str)),
                lists.pop());
        if (!substrings) // FIXME: How is this undefined?
            return [];
        return util.Array.uniq(Array.slice(substrings));
    },
    // Temporary
    get longestAllSubstring() {
        return this.allSubstrings.reduce(function (a, b) a.length > b.length ? a : b, "");
    },

    get caret() this._caret - this.offset,
    set caret(val) this._caret = val + this.offset,

    get compare() this._compare || function () 0,
    set compare(val) this._compare = val,

    get completions() this._completions || [],
    set completions(items) {
        // Accept a generator
        if ({}.toString.call(items) != '[object Array]')
            items = [x for (x in Iterator(items))];
        delete this.cache.filtered;
        delete this.cache.filter;
        this.cache.rows = [];
        this.hasItems = items.length > 0;
        this._completions = items;
        let self = this;
        if (this.updateAsync && !this.noUpdate)
            liberator.callInMainThread(function () { self.onUpdate.call(self); });
    },

    get createRow() this._createRow || template.completionRow, // XXX
    set createRow(createRow) this._createRow = createRow,

    get filterFunc() this._filterFunc || util.identity,
    set filterFunc(val) this._filterFunc = val,

    get filter() this._filter != null ? this._filter : this.value.substr(this.offset, this.caret),
    set filter(val) {
        delete this._ignoreCase;
        return this._filter = val;
    },

    get format() ({
        anchored: this.anchored,
        title: this.title,
        keys: this.keys,
        process: this.process
    }),
    set format(format) {
        this.anchored = format.anchored,
        this.title = format.title || this.title;
        this.keys = format.keys || this.keys;
        this.process = format.process || this.process;
    },

    get message() this._message || (this.waitingForTab ? "Waiting for <Tab>" : null),
    set message(val) this._message = val,

    get proto() {
        let res = {};
        for (let i in Iterator(this.keys)) {
            let [k, v] = i;
            let _k = "_" + k;
            if (typeof v == "string" && /^[.[]/.test(v))
                v = eval("(function (i) i" + v + ")");
            if (typeof v == "function")
                res.__defineGetter__(k, function () _k in this ? this[_k] : (this[_k] = v(this.item)));
            else
                res.__defineGetter__(k, function () _k in this ? this[_k] : (this[_k] = this.item[v]));
            res.__defineSetter__(k, function (val) this[_k] = val);
        }
        return res;
    },

    get regenerate() this._generate && (!this.completions || !this.itemCache[this.key] || this.cache.offset != this.offset),
    set regenerate(val) { if (val) delete this.itemCache[this.key]; },

    get generate() !this._generate ? null : function () {
        if (this.offset != this.cache.offset)
            this.itemCache = {};
        this.cache.offset = this.offset;
        if (!this.itemCache[this.key])
            this.itemCache[this.key] = this._generate.call(this) || [];
        return this.itemCache[this.key];
    },
    set generate(arg) {
        this.hasItems = true;
        this._generate = arg;
        if (this.background && this.regenerate) {
            let lock = {};
            this.cache.backgroundLock = lock;
            this.incomplete = true;
            let thread = this.getCache("backgroundThread", liberator.newThread);
            liberator.callAsync(thread, this, function () {
                if (this.cache.backgroundLock != lock)
                    return;
                let items = this.generate();
                if (this.cache.backgroundLock != lock)
                    return;
                this.incomplete = false;
                this.completions = items;
            });
        }
    },

    // TODO: Is this actually broken anyway?
    get ignoreCase() {
        if ("_ignoreCase" in this)
            return this._ignoreCase;
        // smart case by default unless overriden above
        return this._ignoreCase = !/[A-Z]/.test(this.filter);
    },
    set ignoreCase(val) this._ignoreCase = val,

    get items() {
        if (!this.hasItems || this.backgroundLock)
            return [];
        if (this.cache.filtered && this.cache.filter == this.filter)
            return this.cache.filtered;
        this.cache.rows = [];
        let items = this.completions;
        if (this.generate && !this.background) {
            // XXX
            this.noUpdate = true;
            this.completions = items = this.generate();
            this.noUpdate = false;
        }
        this.cache.filter = this.filter;
        if (items == null)
            return items;

        let self = this;
        delete this._substrings;

        let proto = this.proto;
        let filtered = this.filterFunc(items.map(function (item) ({ __proto__: proto, item: item })));
        if (this.maxItems)
            filtered = filtered.slice(0, this.maxItems);

        if (this.compare)
            filtered.sort(this.compare);
        let quote = this.quote;
        if (quote)
            filtered.forEach(function (item) {
                item.unquoted = item.text;
                item.text = quote[0] + quote[1](item.text) + quote[2];
            });
        return this.cache.filtered = filtered;
    },

    get process() { // FIXME
        let self = this;
        let process = this._process;
        process = [process[0] || template.icon, process[1] || function (item, k) k];
        let first = process[0];
        let second = process[1];
        let filter = this.filter;
        if (!this.anchored){
            process[0] = function (item, text) first.call(self, item, template.highlightFilter(item.text, filter));
            process[1] = function (item, text) second.call(self, item, item.description, filter);
        }
        return process;
    },
    set process(process) {
        this._process = process;
    },

    get substrings() {
        let items = this.items;
        if (items.length == 0 || !this.hasItems)
            return [];
        if (this._substrings)
            return this._substrings;

        let fixCase = this.ignoreCase ? String.toLowerCase : util.identity;
        let text = fixCase(items[0].unquoted || items[0].text);
        let filter = fixCase(this.filter);
        if (this.anchored) {
            var compare = function compare(text, s) text.substr(0, s.length) == s;
            substrings = util.map(util.range(filter.length, text.length + 1),
                function (end) text.substring(0, end));
        }
        else {
            var compare = function compare(text, s) text.indexOf(s) >= 0;
            substrings = [];
            let start = 0;
            let idx;
            let length = filter.length;
            while ((idx = text.indexOf(filter, start)) > -1 && idx < text.length) {
                for (let end in util.range(idx + length, text.length + 1))
                    substrings.push(text.substring(idx, end));
                start = idx + 1;
            }
        }
        substrings = items.reduce(
                function (res, item) res.filter(function (str) compare(fixCase(item.unquoted || item.text), str)),
                substrings);
        let quote = this.quote;
        if (quote)
            substrings = substrings.map(function (str) quote[0] + quote[1](str));
        return this._substrings = substrings;
    },

    /**
     * Advances the context <b>count</b> characters. {@link #filter} is
     * advanced to match. If {@link #quote} is non-null, its prefix and suffix
     * are set to the null-string.
     *
     * This function is still imperfect for quoted strings. When
     * {@link #quote} is non-null, it adjusts the count based on the quoted
     * size of the <b>count</b>-character substring of the filter, which is
     * accurate so long as unquoting and quoting a string will always map to
     * the original quoted string, which is often not the case.
     *
     * @param {number} count The number of characters to advance the context.
     */
    advance: function advance(count) {
        delete this._ignoreCase;
        if (this.quote) {
            count = this.quote[0].length + this.quote[1](this.filter.substr(0, count)).length;
            this.quote[0] = "";
            this.quote[2] = "";
        }
        this.offset += count;
        if (this._filter)
            this._filter = this._filter.substr(count);
    },

    cancelAll: function () {
        for (let [, context] in Iterator(this.contextList)) {
            if (context.cancel)
                context.cancel();
        }
    },

    /**
     * Gets a key from {@link #cache}, setting it to <b>defVal</b> if it
     * doesn't already exists.
     *
     * @param {string} key
     * @param defVal
     */
    getCache: function (key, defVal) {
        if (!(key in this.cache))
            this.cache[key] = defVal();
        return this.cache[key];
    },

    getItems: function getItems(start, end) {
        let self = this;
        let items = this.items;
        let step = start > end ? -1 : 1;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end ? end : items.length);
        return util.map(util.range(start, end, step), function (i) items[i]);
    },

    getRows: function getRows(start, end, doc) {
        let self = this;
        let items = this.items;
        let cache = this.cache.rows;
        let step = start > end ? -1 : 1;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end != null ? end : items.length);
        for (let i in util.range(start, end, step))
            yield [i, cache[i] = cache[i] || util.xmlToDom(self.createRow(items[i]), doc)];
    },

    fork: function fork(name, offset, self, completer) {
        if (typeof completer == "string")
            completer = self[completer];
        let context = CompletionContext(this, name, offset);
        this.contextList.push(context);
        if (completer)
            return completer.apply(self || this, [context].concat(Array.slice(arguments, arguments.callee.length)));
        return context;
    },

    getText: function getText(item) {
        let text = item[self.keys["text"]];
        if (self.quote)
            return self.quote(text);
        return text;
    },

    highlight: function highlight(start, length, type) {
        try { // Gecko < 1.9.1 doesn't have repaintSelection
            this.selectionTypes[type] = null;
            const selType = Ci.nsISelectionController["SELECTION_" + type];
            const editor = this.editor;
            let sel = editor.selectionController.getSelection(selType);
            if (length == 0)
                sel.removeAllRanges();
            else {
                let range = editor.selection.getRangeAt(0).cloneRange();
                range.setStart(range.startContainer, this.offset + start);
                range.setEnd(range.startContainer, this.offset + start + length);
                sel.addRange(range);
            }
            editor.selectionController.repaintSelection(selType);
        }
        catch (e) {}
    },

    // FIXME
    _match: function _match(filter, str) {
        if (!filter)
            return true;

        let ignoreCase = this.ignoreCase;
        let filterArr = filter.split(" ");
        let self = this;
        let res = filterArr.filter(function(word) {
            if (!word)
                return false;

            if (ignoreCase) {
                word = word.toLowerCase();
                str  = str.toLowerCase();
            }
            if (self.anchored)
               return str.substr(0, word.length) == word; // TODO: Why not just use indexOf() == 0 ?
            else
               return str.indexOf(word) > -1;
         });

        return res.length == filterArr.length;
    },

    match: function match(str) {
        return this._match(this.filter, str);
    },

    reset: function reset() {
        let self = this;
        if (this.parent)
            throw Error();
        // Not ideal.
        for (let type in this.selectionTypes)
            this.highlight(0, 0, type);

        /**
         * @property {[CompletionContext]} A list of active
         *     completion contexts, in the order in which they were
         *     instantiated.
         */
        this.contextList = [];
        this.offset = 0;
        this.process = [];
        this.selectionTypes = {};
        this.tabPressed = false;
        this.title = ["Completions"];
        this.updateAsync = false;

        this.cancelAll();

        if (this.editor) {
            this.value = this.editor.selection.focusNode.textContent;
            this._caret = this.inputField.selectionEnd;
        }
        else {
            this.value = this._value;
            this._caret = this.value.length;
        }
        //for (let key in (k for ([k, v] in Iterator(self.contexts)) if (v.offset > this.caret)))
        //    delete this.contexts[key];
        for each (let context in this.contexts) {
            context.hasItems = false;
            if (context != context.top)
                context.incomplete = false;
        }
    },

    /**
     * Wait for all subcontexts to complete.
     *
     * @param {boolean} interruptible When true, the call may be interrupted
     *    via <C-c>, in which case, "Interrupted" may be thrown.
     * @param {number} timeout The maximum time, in milliseconds, to wait.
     *    If 0 or null, wait indefinately.
     */
    wait: function wait(interruptable, timeout) {
        let end = Date.now() + timeout;
        while (this.incomplete && (!timeout || Date.now() > end))
            liberator.threadYield(false, interruptable);
        return this.incomplete;
    }
}, {
    Sort: {
        number: function (a, b) parseInt(b) - parseInt(a) || String.localeCompare(a, b),

        unsorted: null
    },

    Filter: {
        text: function (item) {
            let text = Array.concat(item.text);
            for (let [i, str] in Iterator(text)) {
                if (this.match(String(str))) {
                    item.text = String(text[i]);
                    return true;
                }
            }
            return false;
        },
        textDescription: function (item) {
            return CompletionContext.Filter.text.call(this, item) || this.match(item.description);
        },
        textAndDescription: function (item) {
            return this.match(item.text + item.description);
        }
    }
});

/**
 * @instance completion
 */
const Completion = Module("completion", {
    init: function () {
    },

    get setFunctionCompleter() JavaScript.setCompleter, // Backward compatibility

    // FIXME
    _runCompleter: function _runCompleter(name, filter, maxItems, tags, keyword, contextFilter) {
        let context = CompletionContext(filter || "");
        context.maxItems = maxItems;
        if (contextFilter)
            context.filters = [contextFilter];
        let res = context.fork.apply(context, ["run", 0, this, name].concat(Array.slice(arguments, 3)));
        if (res) // FIXME
            return { items: res.map(function (i) ({ item: i })) };
        context.wait(true);
        return context.allItems;
    },

    runCompleter: function runCompleter(name, filter, maxItems, tags, keyword, contextFilter) {
        return this._runCompleter.apply(this, Array.slice(arguments))
                   .items.map(function (i) i.item);
    },

    listCompleter: function listCompleter(name, filter, maxItems, tags, keyword, contextFilter) {
        let context = CompletionContext(filter || "");
        context.maxItems = maxItems;
        if (contextFilter)
            context.filters = [contextFilter];
        context.fork.apply(context, ["list", 0, completion, name].concat(Array.slice(arguments, 3)));
        context.wait();

        for (let [key, context] in Iterator(context.contexts)) {
            if (key.indexOf("/list") == 0) {
                let list = template.genericOutput("",
                    <div highlight="Completions">
                        { template.completionRow(context.title, "CompTitle") }
                        { template.map(context.items, function (item) context.createRow(item), null, 100) }
                    </div>);
                commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            }
        }
    },

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// COMPLETION TYPES ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // filter a list of urls
    //
    // may consist of search engines, filenames, bookmarks and history,
    // depending on the 'complete' option
    // if the 'complete' argument is passed like "h", it temporarily overrides the complete option
    url: function url(context, complete) {
        let numLocationCompletions = 0; // how many async completions did we already return to the caller?
        let start = 0;
        let skip = 0;

        if (options["urlseparator"])
            skip = context.filter.match("^.*" + options["urlseparator"]); // start after the last 'urlseparator'

        if (skip)
            context.advance(skip[0].length);

        if (typeof complete === "undefined")
            complete = options["complete"];

        // Will, and should, throw an error if !(c in opts)
        Array.forEach(complete, function (c) {
            let completer = completion.urlCompleters[c];
            context.fork.apply(context, [c, 0, completion, completer.completer].concat(completer.args));
        });
    },

    urlCompleters: {},

    addUrlCompleter: function addUrlCompleter(opt) {
        let completer = Completion.UrlCompleter.apply(null, Array.slice(arguments));
        completer.args = Array.slice(arguments, completer.length);
        this.urlCompleters[opt] = completer;
    },

    urls: function (context, tags) {
        let compare = String.localeCompare;
        let contains = String.indexOf;
        if (context.ignoreCase) {
            compare = util.compareIgnoreCase;
            contains = function (a, b) a && a.toLowerCase().indexOf(b.toLowerCase()) > -1;
        }

        if (tags)
            context.filters.push(function (item) tags.
                every(function (tag) (item.tags || []).
                    some(function (t) !compare(tag, t))));

        context.anchored = false;
        if (!context.title)
            context.title = ["URL", "Title"];
    }
    //}}}
}, {
    UrlCompleter: Struct("name", "description", "completer")
});

// vim: set fdm=marker sw=4 ts=4 et:
