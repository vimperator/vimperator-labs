/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

// An eval with a cleaner lexical scope.
modules._cleanEval = function _cleanEval(__liberator_eval_arg, __liberator_eval_tmp)
{
    return window.eval(__liberator_eval_arg);
}

function CompletionContext(editor, name, offset)
{
    if (!(this instanceof arguments.callee))
        return new arguments.callee(editor, name, offset);
    if (!name)
        name = "";

    let self = this;
    if (editor instanceof arguments.callee)
    {
        let parent = editor;
        name = parent.name + "/" + name;
        this.contexts = parent.contexts;
        if (name in this.contexts)
            self = this.contexts[name];
        else
            self.contexts[name] = this;
        self.filters = parent.filters.slice();
        self.incomplete = false;
        self.message = null;
        self.parent = parent;
        self.offset = parent.offset + (offset || 0);
        self.keys = util.cloneObject(parent.keys);
        delete self._filter; // FIXME?
        delete self._generate;
        delete self._ignoreCase;
        ["anchored", "compare", "editor", "filterFunc", "keys", "_process", "quote", "title", "top"].forEach(function (key)
            self[key] = parent[key]);
        if (self != this)
            return self;
        ["_caret", "contextList", "maxItems", "onUpdate", "selectionTypes", "tabPressed", "updateAsync", "value", "waitingForTab"].forEach(function (key) {
            self.__defineGetter__(key, function () this.top[key]);
            self.__defineSetter__(key, function (val) this.top[key] = val);
        });
    }
    else
    {
        if (typeof editor == "string")
            this._value = editor;
        else
            this.editor = editor;
        this.compare = function (a, b) String.localeCompare(a.text, b.text);
        this.filterFunc = function (items)
        {
            let self = this;
            return this.filters.reduce(
                    function (res, filter) res.filter(function (item) filter.call(self, item)),
                    items);
        }
        this.filters = [function (item) {
            let text = Array.concat(this.getKey(item, "text"));
            for (let [i, str] in Iterator(text))
            {
                if (this.match(String(str)))
                {
                    item.text = String(text[i]);
                    return true;
                }
            }
            return false;
        }];
        this.contexts = { name: this };
        this.keys = { text: 0, description: 1, icon: "icon" };
        this.offset = offset || 0;
        this.onUpdate = function () true;
        this.top = this;
        this.__defineGetter__("incomplete", function () this.contextList.some(function (c) c.parent && c.incomplete));
        this.reset();
    }
    this.cache = {};
    this.itemCache = {};
    this.key = "";
    this.message = null;
    this.name = name || "";
    this._completions = []; // FIXME
    this.getKey = function (item, key) (typeof self.keys[key] == "function") ? self.keys[key].call(this, item) : item.item[self.keys[key]];
}
CompletionContext.prototype = {
    // Temporary
    get allItems()
    {
        try
        {
            let self = this;
            let minStart = Math.min.apply(Math, [context.offset for ([k, context] in Iterator(this.contexts)) if (context.items.length && context.hasItems)]);
            let items = this.contextList.map(function (context) {
                if (!context.hasItems)
                    return [];
                let prefix = self.value.substring(minStart, context.offset);
                return context.items.map(function makeItem(item) ({ text: prefix + item.text, item: item.item }));
            });
            return { start: minStart, items: util.Array.flatten(items), longestSubstring: this.longestAllSubstring }
        }
        catch (e)
        {
            liberator.reportError(e);
            return { start: 0, items: [], longestAllSubstring: "" }
        }
    },
    // Temporary
    get allSubstrings()
    {
        let contexts = this.contextList.filter(function (c) c.hasItems && c.items.length);
        let minStart = Math.min.apply(Math, contexts.map(function (c) c.offset));
        let lists = contexts.map(function (context) {
            let prefix = context.value.substring(minStart, context.offset);
            return context.substrings.map(function (s) prefix + s);
        });

        let substrings = lists.reduce(
                function (res, list) res.filter(
                    function (str) list.some(function (s) s.substr(0, str.length) == str)),
                lists.pop());
        if (!substrings) // FIXME: How is this undefined?
            return [];
        return util.Array.uniq(substrings);
    },
    // Temporary
    get longestAllSubstring()
    {
        return this.allSubstrings.reduce(function (a, b) a.length > b.length ? a : b, "");
    },

    get caret() this._caret - this.offset,

    get compare() this._compare || function () 0,
    set compare(val) this._compare = val,

    get completions() this._completions || [],
    set completions(items)
    {
        // Accept a generator
        if (!(items instanceof Array))
            items = [x for (x in items)];
        delete this.cache.filtered;
        delete this.cache.filter;
        this.cache.rows = [];
        this.hasItems = items.length > 0;
        this._completions = items;
        let self = this;
        if (this.updateAsync && !this.noUpdate)
            liberator.callInMainThread(function () { self.onUpdate.call(self) });
    },

    get createRow() this._createRow || template.completionRow, // XXX
    set createRow(createRow) this._createRow = createRow,

    get filterFunc() this._filterFunc || util.identity,
    set filterFunc(val) this._filterFunc = val,

    get filter() this._filter != null ? this._filter : this.value.substr(this.offset, this.caret),
    set filter(val)
    {
        delete this._ignoreCase;
        return this._filter = val
    },

    get format() ({
        title: this.title,
        keys: this.keys,
        process: this.process
    }),
    set format(format)
    {
        this.title = format.title || this.title;
        this.keys = format.keys || this.keys;
        this.process = format.process || this.process;
    },

    //get message() this._message || (this.incomplete ? "Waiting..." : null),
    //set message(val) this._message = val,

    get regenerate() this._generate && (!this.completions || !this.itemCache[this.key] || this.cache.offset != this.offset),
    set regenerate(val) { if (val) delete this.itemCache[this.key] },

    get generate() !this._generate ? null : function ()
    {
        if (this.offset != this.cache.offset)
            this.itemCache = {};
        this.cache.offset = this.offset;
        if (!this.itemCache[this.key])
            this.itemCache[this.key] = this._generate.call(this);
        return this.itemCache[this.key];
    },
    set generate(arg)
    {
        this.hasItems = true;
        this._generate = arg;
        if (this.background && this.regenerate)
        {
            let lock = {};
            this.cache.backgroundLock = lock;
            this.incomplete = true;
            liberator.callAsync(this, function () {
                let items = this.generate();
                if (this.cache.backgroundLock != lock)
                    return;
                this.incomplete = false;
                this.completions = items;
            });
        }
    },

    get ignoreCase()
    {
        if ("_ignoreCase" in this)
            return this._ignoreCase;
        let mode = options["wildcase"];
        if (mode == "match")
            return this._ignoreCase = false;
        if (mode == "ignore")
            return this._ignoreCase = true;
        return this._ignoreCase = !/[A-Z]/.test(this.filter);
    },
    set ignoreCase(val) this._ignoreCase = val,

    get items()
    {
        if (!this.hasItems || this.backgroundLock)
            return [];
        if (this.cache.filtered && this.cache.filter == this.filter)
            return this.cache.filtered;
        this.cache.rows = [];
        let items = this.completions;
        if (this.generate && !this.background)
        {
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

        let filtered = this.filterFunc(items.map(function (item) ({ text: self.getKey({ item: item }, "text"), item: item })));
        if (this.maxItems)
            filtered = filtered.slice(0, this.maxItems);

        let quote = this.quote;
        if (quote)
            filtered.forEach(function (item) {
                item.unquoted = item.text;
                item.text = quote[0] + quote[1](item.text) + quote[2];
            })
        if (options.get("wildoptions").has("sort"))
            filtered.sort(this.compare);
        return this.cache.filtered = filtered;
    },

    get process() // FIXME
    {
        let self = this;
        let process = this._process;
        process = [process[0] || template.icon, process[1] || function (item, k) k];
        let first = process[0];
        let filter = this.filter;
        if (!this.anchored)
            process[0] = function (item, text) first.call(self, item, template.highlightFilter(item.text, filter));
        return process;
    },
    set process(process)
    {
        this._process = process;
    },

    get substrings()
    {
        let items = this.items;
        if (items.length == 0)
            return [];
        if (this._substrings)
            return this._substrings;

        let fixCase = this.ignoreCase ? String.toLowerCase : util.identity;
        let text = fixCase(items[0].unquoted || items[0].text);
        let filter = fixCase(this.filter);
        if (this.anchored)
        {
            function compare (text, s) text.substr(0, s.length) == s;
            substrings = util.map(util.range(filter.length, text.length + 1),
                function (end) text.substring(0, end));
        }
        else
        {
            function compare (text, s) text.indexOf(s) >= 0;
            substrings = [];
            let start = 0;
            let idx;
            let length = filter.length;
            while ((idx = text.indexOf(filter, start)) > -1 && idx < text.length)
            {
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

    advance: function advance(count)
    {
        delete this._ignoreCase;
        this.offset += count;
        if (this.quote)
        {
            this.offset += this.quote[0].length;
            this.quote[0] = "";
            this.quote[2] = "";
        }
        // XXX
        if (this._filter)
            this._filter = this._filter.substr(count);
    },

    getItems: function getItems(start, end)
    {
        let self = this;
        let items = this.items;
        let reverse = start > end;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end ? end : items.length);
        return util.map(util.range(start, end, reverse), function (i) items[i]);
    },

    getRows: function getRows(start, end, doc)
    {
        let self = this;
        let items = this.items;
        let cache = this.cache.rows;
        let reverse = start > end;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end != null ? end : items.length);
        for (let i in util.range(start, end, reverse))
            yield [i, cache[i] = cache[i] || util.xmlToDom(self.createRow(items[i]), doc)];
    },

    fork: function fork(name, offset, self, completer)
    {
        if (typeof completer == "string")
            completer = self[completer]
        let context = new CompletionContext(this, name, offset);
        this.contextList.push(context);
        if (completer)
            return completer.apply(self || this, [context].concat(Array.slice(arguments, 4)));
        return context;
    },

    getText: function getText(item)
    {
        let text = item[self.keys["text"]];
        if (self.quote)
            return self.quote(text);
        return text;
    },

    highlight: function highlight(start, length, type)
    {
        try // Firefox <3.1 doesn't have repaintSelection
        {
            this.selectionTypes[type] = null;
            const selType = Components.interfaces.nsISelectionController["SELECTION_" + type];
            const editor = this.editor;
            let sel = editor.selectionController.getSelection(selType);
            if (length == 0)
                sel.removeAllRanges();
            else
            {
                let range = editor.selection.getRangeAt(0).cloneRange();
                range.setStart(range.startContainer, this.offset + start);
                range.setEnd(range.startContainer, this.offset + start + length);
                sel.addRange(range);
            }
            editor.selectionController.repaintSelection(selType);
        }
        catch (e) {}
    },

    match: function match(str)
    {
        let filter = this.filter;
        if (this.ignoreCase)
        {
            filter = filter.toLowerCase();
            str = str.toLowerCase();
        }
        if (this.anchored)
            return str.substr(0, filter.length) == filter;
        return str.indexOf(filter) > -1;
    },

    reset: function reset()
    {
        let self = this;
        if (this.parent)
            throw Error();
        // Not ideal.
        for (let type in this.selectionTypes)
            this.highlight(0, 0, type);
        this.contextList = [];
        this.offset = 0;
        this.process = [];
        this.selectionTypes = {};
        this.tabPressed = false;
        this.title = ["Completions"];
        this.waitingForTab = false;
        this.updateAsync = false;
        if (this.editor)
        {
            this.value = this.editor.rootElement.textContent;
            this._caret = this.editor.selection.getRangeAt(0).startOffset;
        }
        else
        {
            this.value = this._value;
            this._caret = this.value.length;
        }
        //for (let key in (k for ([k, v] in Iterator(self.contexts)) if (v.offset > this.caret)))
        //    delete this.contexts[key];
        for each (let context in this.contexts)
        {
            context.hasItems = false;
            context.incomplete = false;
        }
    },

    wait: function wait(interruptable, timeout)
    {
        let end = Date.now() + timeout;
        while (this.incomplete && (!timeout || Date.now() > end))
            liberator.threadYield(true, interruptable);
        return this.incomplete;
    }
}

function Completion() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    try
    {
        var completionService = Components.classes["@mozilla.org/browser/global-history;2"]
                                          .getService(Components.interfaces.nsIAutoCompleteSearch);
    }
    catch (e) {}

    const EVAL_TMP = "__liberator_eval_tmp";
    Javascript.cleanEval = _cleanEval;
    delete modules._cleanEval;

    function Javascript()
    {
        let json = Components.classes["@mozilla.org/dom/json;1"]
                             .createInstance(Components.interfaces.nsIJSON);
        const OFFSET = 0, CHAR = 1, STATEMENTS = 2, DOTS = 3, FULL_STATEMENTS = 4, FUNCTIONS = 5;
        let stack = [];
        let functions = [];
        let top = [];  /* The element on the top of the stack. */
        let last = ""; /* The last opening char pushed onto the stack. */
        let lastNonwhite = ""; /* Last non-whitespace character we saw. */
        let lastChar = "";     /* Last character we saw, used for \ escaping quotes. */
        let compl = [];
        let str = "";

        let lastIdx = 0;

        let cacheKey = null;

        this.completers = {};

        this.iter = function iter(obj)
        {
            let iterator = (function objIter()
            {
                for (let k in obj)
                {
                    // Some object members are only accessible as function calls
                    try
                    {
                        yield [k, obj[k]];
                        continue;
                    }
                    catch (e) {}
                    yield [k, <>inaccessable</>]
                }
            })();
            try
            {
                // The point of 'for k in obj' is to get keys
                // that are accessible via . or [] notation.
                // Iterators quite often return values of no
                // use whatsoever for this purpose, so, we try
                // this rather dirty hack of getting a standard
                // object iterator for any object that defines its
                // own.
                if ("__iterator__" in obj)
                {
                    let oldIter = obj.__iterator__;
                    delete obj.__iterator__;
                    iterator = Iterator(obj);
                    obj.__iterator__ = oldIter;
                }
            }
            catch (e) {}
            return iterator;
        }

        /* Search the object for strings starting with @key.
         * If @last is defined, key is a quoted string, it's
         * wrapped in @last after @offset characters are sliced
         * off of it and it's quoted.
         */
        this.objectKeys = function objectKeys(obj)
        {
            // Things we can dereference
            if (["object", "string", "function"].indexOf(typeof obj) == -1)
                return [];
            if (!obj)
                return [];

            // XPCNativeWrappers, etc, don't show all accessible
            // members until they're accessed, so, we look at
            // the wrappedJSObject instead, and return any keys
            // available in the object itself.
            let orig = obj;
            if (obj.wrappedJSObject)
                obj = obj.wrappedJSObject;
            // v[0] in orig and orig[v[0]] catch different cases. XPCOM
            // objects are problematic, to say the least.
            compl = [v for (v in this.iter(obj)) if (v[0] in orig || orig[v[0]] !== undefined)];
            // And if wrappedJSObject happens to be available,
            // return that, too.
            if (orig.wrappedJSObject)
                compl.push(["wrappedJSObject", obj]);
            // Parse keys for sorting
            compl.forEach(function (item) {
                let key = item[0];
                if (!isNaN(key))
                    key = parseInt(key);
                else if (/^[A-Z_]+$/.test(key))
                    key = "";
                item.key = key;
            });
            return compl;
        }

        this.eval = function eval(arg, key, tmp)
        {
            let cache = this.context.cache.eval;
            if (!key)
                key = arg;
            if (key in cache)
                return cache[key];

            try
            {
                return cache[key] = Javascript.cleanEval(arg, tmp);
            }
            catch (e)
            {
                return null;
            }
        }

        /* Get an element from the stack. If @n is negative,
         * count from the top of the stack, otherwise, the bottom.
         * If @m is provided, return the @mth value of element @o
         * of the stack entey at @n.
         */
        let get = function get(n, m, o)
        {
            let a = stack[n >= 0 ? n : stack.length + n];
            if (m == undefined)
                return a;
            return a[o][a[o].length - m - 1];
        }

        function buildStack(start)
        {
            let self = this;
            /* Push and pop the stack, maintaining references to 'top' and 'last'. */
            let push = function push(arg)
            {
                top = [i, arg, [i], [], [], []];
                last = top[CHAR];
                stack.push(top);
            }
            let pop = function pop(arg)
            {
                if (top[CHAR] != arg)
                {
                    self.context.highlight(top[OFFSET], i - top[OFFSET], "SPELLCHECK");
                    self.context.highlight(top[OFFSET], 1, "FIND");
                    throw new Error("Invalid JS");
                }
                if (i == self.context.caret - 1)
                    self.context.highlight(top[OFFSET], 1, "FIND");
                // The closing character of this stack frame will have pushed a new
                // statement, leaving us with an empty statement. This doesn't matter,
                // now, as we simply throw away the frame when we pop it, but it may later.
                if (top[STATEMENTS][top[STATEMENTS].length - 1] == i)
                    top[STATEMENTS].pop();
                top = get(-2);
                last = top[CHAR];
                let ret = stack.pop();
                return ret;
            }

            let i = 0, c = "";     /* Current index and character, respectively. */

            stack = [];
            functions = [];
            push("#root");

            /* Build a parse stack, discarding entries as opening characters
             * match closing characters. The stack is walked from the top entry
             * and down as many levels as it takes us to figure out what it is
             * that we're completing.
             */
            let length = str.length;
            for (; i < length; lastChar = c, i++)
            {
                c = str[i];
                if (last == '"' || last == "'" || last == "/")
                {
                    if (lastChar == "\\") // Escape. Skip the next char, whatever it may be.
                    {
                        c = "";
                        i++;
                    }
                    else if (c == last)
                        pop(c);
                }
                else
                {
                    // A word character following a non-word character, or simply a non-word
                    // character. Start a new statement.
                    if (/[\w$]/.test(c) && !/[\w\d$]/.test(lastChar) || !/[\w\d\s$]/.test(c))
                        top[STATEMENTS].push(i);

                    // A "." or a "[" dereferences the last "statement" and effectively
                    // joins it to this logical statement.
                    if ((c == "." || c == "[") && /[\w\d$\])"']/.test(lastNonwhite)
                    ||  lastNonwhite == "." && /[\w$]/.test(c))
                            top[STATEMENTS].pop();

                    switch (c)
                    {
                        case "(":
                            /* Function call, or if/while/for/... */
                            if (/[\w\d$]/.test(lastNonwhite))
                            {
                                functions.push(i);
                                top[FUNCTIONS].push(i);
                                top[STATEMENTS].pop();
                            }
                        case '"':
                        case "'":
                        case "/":
                        case "{":
                            push(c);
                            break;
                        case "[":
                            push(c);
                            break;
                        case ".":
                            top[DOTS].push(i);
                            break;
                        case ")": pop("("); break;
                        case "]": pop("["); break;
                        case "}": pop("{"); /* Fallthrough */
                        case ";":
                        case ",":
                            top[FULL_STATEMENTS].push(i);
                            break;
                    }

                    if (/\S/.test(c))
                        lastNonwhite = c;
                }
            }

            if (!/[\w\d$]/.test(lastChar) && lastNonwhite != ".")
                top[STATEMENTS].push(i);

            lastIdx = i;
        }

        this.complete = function _complete(context)
        {
            this.context = context;
            let string = context.filter;

            let self = this;
            try
            {
                str = string;
                buildStack.call(this);
            }
            catch (e)
            {
                if (e.message != "Invalid JS")
                    liberator.reportError(e);
                lastIdx = 0;
                return;
            }

            if (!this.context.cache.eval)
                this.context.cache.eval = {};

            /* Okay, have parse stack. Figure out what we're completing. */

            if (/[\])}"';]/.test(str[lastIdx - 1]) && last != '"' && last != '"')
                return;

            // Find any complete statements that we can eval before we eval our object.
            // This allows for things like: let doc = window.content.document; let elem = doc.createElement...; elem.<Tab>
            let prev = 0;
            for (let [,v] in Iterator(get(0)[FULL_STATEMENTS]))
            {
                let key = str.substring(prev, v + 1);
                if (checkFunction(prev, v, key))
                    return;
                this.eval(key);
                prev = v + 1;
            }

            function checkFunction(start, end, key)
            {
                let res = functions.some(function (idx) idx >= start && idx < end);
                if (!res || self.context.tabPressed || key in self.context.cache.eval)
                    return false;
                self.context.waitingForTab = true;
                self.context.message = "Waiting for <Tab>";
                return true;
            }

            // For each DOT in a statement, prefix it with TMP, eval it,
            // and save the result back to TMP. The point of this is to
            // cache the entire path through an object chain, mainly in
            // the presence of function calls. There are drawbacks. For
            // instance, if the value of a variable changes in the course
            // of inputting a command (let foo=bar; frob(foo); foo=foo.bar; ...),
            // we'll still use the old value. But, it's worth it.
            function getObj(frame, stop)
            {
                let statement = get(frame, 0, STATEMENTS) || 0; // Current statement.
                let prev = statement;
                let obj;
                let cacheKey;
                for (let [i, dot] in Iterator(get(frame)[DOTS].concat(stop)))
                {
                    if (dot < statement)
                        continue;
                    if (dot > stop)
                        break;
                    let s = str.substring(prev, dot);

                    if (prev != statement)
                        s = EVAL_TMP + "." + s;
                    cacheKey = str.substring(statement, dot);

                    if (checkFunction(prev, dot, cacheKey))
                        return [];

                    prev = dot + 1;
                    obj = self.eval(s, cacheKey, obj);
                }
                return [[obj, cacheKey]]
            }

            function getObjKey(frame)
            {
                let dot = get(frame, 0, DOTS) || -1; // Last dot in frame.
                let statement = get(frame, 0, STATEMENTS) || 0; // Current statement.
                let end = (frame == -1 ? lastIdx : get(frame + 1)[OFFSET]);

                cacheKey = null;
                let obj = [[modules, "modules"], [window, "window"]]; // Default objects;
                /* Is this an object dereference? */
                if (dot < statement) // No.
                    dot = statement - 1;
                else // Yes. Set the object to the string before the dot.
                    obj = getObj(frame, dot);

                let [, space, key] = str.substring(dot + 1, end).match(/^(\s*)(.*)/);
                return [dot + 1 + space.length, obj, key];
            }

            function fill(context, obj, name, compl, anchored, key, last, offset)
            {
                context.title = [name];
                context.anchored = anchored;
                context.filter = key;
                context.itemCache = context.parent.itemCache;
                context.key = name;

                if (last != undefined)
                    context.quote = [last, function (text) util.escapeString(text.substr(offset), ""), last];
                else // We're not looking for a quoted string, so filter out anything that's not a valid identifier
                    context.filters.push(function (item) /^[\w$][\w\d$]*$/.test(item.text));

                compl.call(self, context, obj);
            }

            function complete(objects, key, compl, string, last)
            {
                let orig = compl;
                if (!compl)
                    compl = function (context, obj) {
                        context.process = [null, function highlight(item, v) template.highlight(v, true)];
                        if (!context.anchored)
                            context.filters.push(function (item) util.compareIgnoreCase(item.text.substr(0, key.length), key));
                        context.compare = function ({ item: { key: a } }, { item: { key: b } })
                        {
                            if (!isNaN(a) && !isNaN(b))
                                return a - b;
                            return String.localeCompare(a, b);
                        }
                        context.generate = function () self.objectKeys(obj);
                    }
                let filter = key + (string || "");
                for (let [,obj] in Iterator(objects))
                {
                    try
                    {
                        this.context.fork(obj[1], top[OFFSET], this, fill,
                            obj[0], obj[1], compl, compl != orig, filter, last, key.length);
                    }
                    catch (e) { liberator.reportError(e) }
                }
                if (orig)
                    return;
                for (let [,obj] in Iterator(objects))
                {
                    obj[1] += " (substrings)";
                    this.context.fork(obj[1], top[OFFSET], this, fill,
                        obj[0], obj[1], compl, false, filter, last, key.length);
                }
            }

            // In a string. Check if we're dereferencing an object.
            // Otherwise, do nothing.
            if (last == "'" || last == '"')
            {
            // TODO: Make this work with unquoted integers.

                /*
                 * str = "foo[bar + 'baz"
                 * obj = "foo"
                 * key = "bar + ''"
                 */
                // The top of the stack is the sting we're completing.
                // Wrap it in its delimiters and eval it to process escape sequences.
                let string = str.substring(top[OFFSET] + 1);
                string = eval(last + string + last);

                /* Is this an object accessor? */
                if (get(-2)[CHAR] == "[") // Are we inside of []?
                {
                    /* Stack:
                     *  [-1]: "...
                     *  [-2]: [...
                     *  [-3]: base statement
                     */

                    // Yes. If the [ starts at the begining of a logical
                    // statement, we're in an array literal, and we're done.
                     if (get(-3, 0, STATEMENTS) == get(-2)[OFFSET])
                        return;

                    // Begining of the statement upto the opening [
                    let obj = getObj(-3, get(-2)[OFFSET]);
                    // After the opening [ upto the opening ", plus '' to take care of any operators before it
                    let key = str.substring(get(-2)[OFFSET] + 1, top[OFFSET]) + "''";
                    // Now eval the key, to process any referenced variables.
                    key = this.eval(key);

                    return complete.call(this, obj, key, null, string, last);
                }

                // Is this a function call?
                if (get(-2)[CHAR] == "(")
                {
                    /* Stack:
                     *  [-1]: "...
                     *  [-2]: (...
                     *  [-3]: base statement
                     */

                    // Does the opening "(" mark a function call?
                    if (get(-3, 0, FUNCTIONS) != get(-2)[OFFSET])
                        return; // No. We're done.

                    let [offset, obj, func] = getObjKey(-3);
                    let key = str.substring(get(-2, 0, STATEMENTS), top[OFFSET]) + "''";
                    if (!obj.length)
                        return;

                    try
                    {
                        var completer = obj[0][0][func].liberatorCompleter;
                    }
                    catch (e) {}
                    if (!completer)
                        completer = this.completers[func];
                    if (!completer)
                        return;

                    // Split up the arguments
                    let prev = get(-2)[OFFSET];
                    let args = [];
                    for (let [i, idx] in Iterator(get(-2)[FULL_STATEMENTS]))
                    {
                        let arg = str.substring(prev + 1, idx);
                        prev = idx;
                        args.__defineGetter__(i, function () self.eval(ret));
                    }
                    key = this.eval(key);
                    args.push(key + string);

                    compl = function (context, obj) {
                        let res = completer.call(self, context, func, obj, args);
                        if (res)
                            context.completions = res;
                    }
                    obj[0][1] += "." + func + "(... [" + args.length + "]";
                    return complete.call(this, obj, key, compl, string, last);
                }

                // Nothing to do.
                return;
            }

            /*
             * str = "foo.bar.baz"
             * obj = "foo.bar"
             * key = "baz"
             *
             * str = "foo"
             * obj = [modules, window]
             * key = "foo"
             */

            let [offset, obj, key] = getObjKey(-1);

            if (!/^(?:\w[\w\d]*)?$/.test(key))
                return; /* Not a word. Forget it. Can this even happen? */

            top[OFFSET] = offset;
            return complete.call(this, obj, key);
        }
    };
    let javascript = new Javascript();

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    let self = {

        setFunctionCompleter: function setFunctionCompleter(funcs, completers)
        {
            funcs = Array.concat(funcs);
            for (let [,func] in Iterator(funcs))
            {
                func.liberatorCompleter = function liberatorCompleter(context, func, obj, args) {
                    let completer = completers[args.length - 1];
                    if (!completer)
                        return [];
                    return completer.call(this, context, obj, args);
                };
            }
        },

        // FIXME
        _runCompleter: function _runCompleter(name, filter)
        {
            let context = CompletionContext(filter);
            let res = context.fork.apply(context, ["run", 0, this, name].concat(Array.slice(arguments, 2)));
            if (res) // FIXME
                return { items: res.map(function (i) ({ item: i })) };
            context.wait(true);
            return context.allItems;
        },

        runCompleter: function runCompleter(name, filter)
        {
            return this._runCompleter(name, filter).items.map(function (i) i.item);
        },

        // cancel any ongoing search
        cancel: function cancel()
        {
            if (completionService)
                completionService.stopSearch();
        },

        // discard all entries in the 'urls' array, which don't match 'filter
        // urls must be of type [{ url: "..", title: "..", tags: [...], keyword: ".." }, ...]
        filterURLArray: function filterURLArray(urls, filter, filterTags)
        {
            var filtered = [];
            // completions which don't match the url but just the description
            // list them at the end of the array
            var additionalCompletions = [];

            if (urls.length == 0)
                return [];

            var hasTags = urls[0].tags !== undefined;

            filterTags = filterTags || [];

            // TODO: use ignorecase and smartcase settings
            var ignorecase = (filter == filter.toLowerCase() && filterTags.every(function checkMixedCase(t) t == t.toLowerCase()));

            if (ignorecase)
            {
                filter = filter.toLowerCase();
                filterTags = filterTags.map(String.toLowerCase);
            }

            // Longest Common Subsequence
            // This shouldn't use buildLongestCommonSubstring for performance
            // reasons, so as not to cycle through the urls twice
            let filterTokens = filter.split(/\s+/);
            for (let [,elem] in Iterator(urls))
            {
                let item = elem.item || elem; // Kludge
                let url   = item.url || "";
                let title = item.title || "";
                let tags  = item.tags || [];
                if (ignorecase)
                {
                    url = url.toLowerCase();
                    title = title.toLowerCase();
                    tags = tags.map(String.toLowerCase);
                }

                // filter on tags
                if (filterTags.some(function aryIndex(tag) tag && tags.indexOf(tag) == -1))
                    continue;

                if (url.indexOf(filter) == -1)
                {
                    // no direct match of filter in the url, but still accept this item
                    // if _all_ tokens of filter match either the url or the title
                    if (filterTokens.every(function (token) url.indexOf(token) > -1 || title.indexOf(token) > -1))
                        additionalCompletions.push(elem);
                    continue;
                }

                filtered.push(elem);
            }

            return filtered.concat(additionalCompletions);
        },

        // generic helper function which checks if the given "items" array pass "filter"
        // items must be an array of strings
        match: function match(items, filter, caseSensitive)
        {
            if (typeof filter != "string" || !items)
                return false;

            var itemsStr = items.join(" ");
            if (!caseSensitive)
            {
                filter = filter.toLowerCase();
                itemsStr = itemsStr.toLowerCase();
            }

            return filter.split(/\s+/).every(function strIndex(str) itemsStr.indexOf(str) > -1);
        },

        listCompleter: function listCompleter(name, filter, maxItems)
        {
            let context = CompletionContext(filter || "");
            context.fork.apply(context, ["list", 0, completion, name].concat(Array.slice(arguments, 2)));
            context = context.contexts["/list"];
            context.maxItems = maxItems;
            context.wait();

            let list = template.generic(
                <div highlight="Completions">
                    { template.completionRow(context.title, "CompTitle") }
                    { template.map(context.items, function (item) context.createRow(item), null, 50) }
                </div>);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// COMPLETION TYPES ////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        autocmdEvent: function autocmdEvent(context)
        {
            context.completions = config.autocommands;
        },

        bookmark: function bookmark(context, tags)
        {
            context.title = ["Bookmark", "Title"];
            context.format = bookmarks.format;
            context.completions = bookmarks.get(context.filter)
            context.filters = [];
            if (tags)
                context.filters.push(function ({ item: item }) tags.every(function (tag) item.tags.indexOf(tag) > -1));
        },

        buffer: function buffer(context)
        {
            filter = context.filter.toLowerCase();
            context.title = ["Buffer", "URL"];
            context.keys = { text: "text", description: "url", icon: "icon" };
            let process = context.process[0];
            context.process = [function (item)
                    <>
                        <span highlight="Indicator" style="display: inline-block; width: 1.5em; text-align: center">{item.item.indicator}</span>
                        { process.call(this, item) }
                    </>];

            context.completions = util.map(tabs.browsers, function ([i, browser]) {
                if (i == tabs.index())
                   indicator = "%"
                else if (i == tabs.index(tabs.alternate))
                   indicator = "#";
                else
                   indicator = " ";

                let tab = tabs.getTab(i);
                i = i + 1;
                let url = browser.contentDocument.location.href;

                return {
                    text: [i + ": " + (tab.label || "(Untitled)"), i + ": " + url],
                    url:  url,
                    indicator: indicator,
                    icon: tab.image || DEFAULT_FAVICON
                };
            });
        },

        colorScheme: function colorScheme(context)
        {
            options.get("runtimepath").values.forEach(function (path) {
                context.fork(path, 0, null, function (context) {
                    context.filter = path + "/colors/" + context.filter;
                    completion.file(context, true);
                    context.title = [path + "/colors/"];
                    context.quote = function (text) text.replace(/\.vimp$/, "");
                });
            });
        },

        command: function command(context)
        {
            context.title = ["Command"];
            context.anchored = true;
            context.keys = { text: "longNames", description: "description" };
            context.completions = [k for (k in commands)];
        },

        dialog: function dialog(context)
        {
            context.title = ["Dialog"];
            context.completions = config.dialogs;
        },

        directory: function directory(context, tail)
        {
            this.file(context, tail);
            context.filters.push(function (item) this.getKey(item, "description") == "Directory");
        },

        environment: function environment(context)
        {
            let command = liberator.has("Win32") ? "set" : "env";
            let lines = io.system(command).split("\n");
            lines.pop();

            context.title = ["Environment Variable", "Value"];
            context.generate = function () lines.map(function (line) (line.match(/([^=]+)=(.+)/) || []).slice(1));
        },

        // provides completions for ex commands, including their arguments
        ex: function ex(context)
        {
            // if there is no space between the command name and the cursor
            // then get completions of the command name
            let [count, cmd, bang, args] = commands.parseCommand(context.filter);
            let [, prefix, junk] = context.filter.match(/^(:*\d*)\w*(.?)/) || [];
            context.advance(prefix.length)
            if (!junk)
                return context.fork("", 0, this, "command");

            // dynamically get completions as specified with the command's completer function
            let command = commands.get(cmd);
            if (!command)
            {
                context.highlight(0, cmd.length, "SPELLCHECK");
                return;
            }

            [prefix] = context.filter.match(/^(?:\w*[\s!]|!)\s*/);
            let cmdContext = context.fork(cmd, prefix.length);
            let argContext = cmdContext.fork("args", args.completeStart);
            args = command.parseArgs(cmdContext.filter, argContext);
            if (args)
            {
                // FIXME: Move to parseCommand
                args.count = count;
                args.bang = bang;
                if (!args.completeOpt && command.completer)
                {
                    cmdContext.advance(args.completeStart);
                    cmdContext.quote = args.quote;
                    cmdContext.filter = args.completeFilter;
                    let compObject = command.completer.call(command, cmdContext, args);
                    if (compObject instanceof Array) // for now at least, let completion functions return arrays instead of objects
                        compObject = { start: compObject[0], items: compObject[1] };
                    if (compObject != null)
                    {
                        cmdContext.advance(compObject.start);
                        cmdContext.filterFunc = null;
                        cmdContext.completions = compObject.items;
                    }
                }
                context.updateAsync = true;
            }
        },

        // TODO: support file:// and \ or / path separators on both platforms
        // if "tail" is true, only return names without any directory components
        file: function file(context, tail)
        {
            let [dir] = context.filter.match(/^(?:.*[\/\\])?/);
            // dir == "" is expanded inside readDirectory to the current dir

            context.title = ["Path", "Type"];
            if (tail)
                context.advance(dir.length);
            context.keys = { text: 0, description: 1, icon: 2 };
            context.anchored = true;
            context.background = true;
            context.key = dir;
            context.generate = function generate_file()
            {
                context.cache.dir = dir;

                try
                {
                    let files = io.readDirectory(dir);

                    if (options["wildignore"])
                    {
                        let wigRegexp = RegExp("(^" + options["wildignore"].replace(",", "|", "g") + ")$");
                        files = files.filter(function (f) f.isDirectory() || !wigRegexp.test(f.leafName))
                    }

                    return files.map(
                        function (file) [tail ? file.leafName : dir + file.leafName,
                                         file.isDirectory() ? "Directory" : "File",
                                         file.isDirectory() ? "resource://gre/res/html/folder.png"
                                                            : "moz-icon://" + file.leafName]
                    );
                }
                catch (e) {}
                return [];
            };
        },

        help: function help(context)
        {
            context.title = ["Help"];
            context.generate = function ()
            {
                let res = config.helpFiles.map(function (file) {
                    let resp = util.httpGet("chrome://liberator/locale/" + file);
                    if (!resp)
                        return [];
                    let doc = resp.responseXML;
                    return Array.map(doc.getElementsByClassName("tag"),
                            function (elem) [elem.textContent, file]);
                });
                return util.Array.flatten(res);
            }
        },

        history: function _history(context)
        {
            context.format = history.format;
            context.title = ["History"]
            context.compare = null;
            //context.background = true;
            context.regenerate = true;
            context.generate = function () history.get(context.filter, this.maxItems);
        },

        get javascriptCompleter() javascript,

        javascript: function _javascript(context) javascript.complete(context),

        location: function location(context)
        {
            if (!completionService)
                return
            context.title = ["Smart Completions"];
            context.keys.icon = 2;
            context.incomplete = true;
            context.hasItems = context.completions.length > 0; // XXX
            context.filterFunc = null;
            context.compare = null;
            let timer = new util.Timer(50, 100, function (result) {
                context.incomplete = result.searchResult >= result.RESULT_NOMATCH_ONGOING;
                context.completions = [
                    [result.getValueAt(i), result.getCommentAt(i), result.getImageAt(i)]
                        for (i in util.range(0, result.matchCount))
                ];
            });
            completionService.stopSearch();
            completionService.startSearch(context.filter, "", context.result, {
                onSearchResult: function onSearchResult(search, result) {
                    context.result = result;
                    timer.tell(result);
                    if (result.searchResult <= result.RESULT_SUCCESS)
                        timer.flush();
                }
            });
        },

        macro: function macro(context)
        {
            context.title = ["Macro", "Keys"];
            context.completions = [item for (item in events.getMacros())];
        },

        menuItem: function menuItem(filter) commands.get("emenu").completer(filter), // XXX

        option: function option(context, scope)
        {
            context.title = ["Option"];
            context.keys = { text: "names", description: "description" };
            context.completions = options;
            if (scope)
                context.filters.push(function ({ item: opt }) opt.scope & scope);
        },

        optionValue: function (context, name, op, curValue)
        {
            let opt = options.get(name);
            let completer = opt.completer;

            let curValues = curValue != null ? opt.parseValues(curValue) : opt.values;
            let newValues = opt.parseValues(context.filter);

            let len = context.filter.length;
            switch (opt.type)
            {
                case "boolean":
                    if (!completer)
                        completer = function () [["true", ""], ["false", ""]];
                    break;
                case "stringlist":
                    len = newValues.pop().length;
                    break;
                case "charlist":
                    len = 0;
                    break;
            }
            // TODO: Highlight when invalid
            context.advance(context.filter.length - len);

            context.title = ["Option Value"];
            let completions = completer(context);
            if (!completions)
                return;
            /* Not vim compatible, but is a significant enough improvement
             * that it's worth breaking compatibility.
             */
            if (newValues instanceof Array)
            {
                completions = completions.filter(function (val) newValues.indexOf(val[0]) == -1);
                switch (op)
                {
                    case "+":
                        completions = completions.filter(function (val) curValues.indexOf(val[0]) == -1);
                        break;
                    case "-":
                        completions = completions.filter(function (val) curValues.indexOf(val[0]) > -1);
                        break;
                }
            }
            context.completions = completions;
        },

        preference: function preference(context)
        {
            let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                                  .getService(Components.interfaces.nsIPrefBranch);
            context.title = ["Firefox Preference", "Value"];
            context.keys = { text: function (item) item.item, description: function (item) options.getPref(item.item) };
            context.completions = prefs.getChildList("", { value: 0 });
        },

        search: function search(context, noSuggest)
        {
            let [, keyword, space, args] = context.filter.match(/^\s*(\S*)(\s*)(.*)$/);
            let keywords = bookmarks.getKeywords();
            let engines = bookmarks.getSearchEngines();

            context.title = ["Search Keywords"];
            context.anchored = true;
            context.completions = keywords.concat(engines);
            context.keys = { text: 0, description: 1, icon: 2 };

            if (!space || noSuggest)
                return;

            context.fork("suggest", keyword.length + space.length, this, "searchEngineSuggest",
                    keyword, true);

            let item = keywords.filter(function (k) k.keyword == keyword)[0];
            if (item && item.url.indexOf("%s") > -1)
                context.fork("keyword/" + keyword, keyword.length + space.length, null, function (context) {
                    context.format = history.format;
                    context.title = [keyword + " Quick Search"];
                    context.anchored = true;
                    context.background = true;
                    context.compare = null;
                    context.generate = function () {
                        let [begin, end] = item.url.split("%s");

                        return history.get({ uri: window.makeURI(begin), uriIsPrefix: true }).map(function (item) {
                            let rest = item.url.length - end.length;
                            let query = item.url.substring(begin.length, rest);
                            if (item.url.substr(rest) == end && query.indexOf("&") == -1)
                            {
                                item.url = decodeURIComponent(query);
                                return item;
                            }
                        }).filter(util.identity);
                    };
                });
        },

        searchEngineSuggest: function searchEngineSuggest(context, engineAliases, kludge)
        {
            if (!context.filter)
                return;

            let ss = Components.classes["@mozilla.org/browser/search-service;1"]
                               .getService(Components.interfaces.nsIBrowserSearchService);
            let engineList = (engineAliases || options["suggestengines"] || "google").split(",");

            let completions = [];
            engineList.forEach(function (name) {
                let engine = ss.getEngineByAlias(name);
                if (!engine)
                    return;
                let [,word] = /^\s*(\S+)/.exec(context.filter) || [];
                if (!kludge && word == name) // FIXME: Check for matching keywords
                    return;
                let ctxt = context.fork(name, 0);

                ctxt.title = [engine.description + " Suggestions"];
                ctxt.background = true;
                ctxt.compare = null;
                ctxt.regenerate = true;
                ctxt.generate = function () bookmarks.getSuggestions(name, this.filter);
            });
        },

        shellCommand: function shellCommand(context)
        {
            context.title = ["Shell Command", "Path"];
            context.generate = function ()
            {
                const environmentService = Components.classes["@mozilla.org/process/environment;1"]
                                                     .getService(Components.interfaces.nsIEnvironment);

                let dirNames = environmentService.get("PATH").split(RegExp(liberator.has("Win32") ? ";" : ":"));
                let commands = [];

                for (let [,dirName] in Iterator(dirNames))
                {
                    let dir = io.getFile(dirName);
                    if (dir.exists() && dir.isDirectory())
                    {
                        commands.push([[file.leafName, dir.path] for ([i, file] in Iterator(io.readDirectory(dir)))
                                            if (file.isFile() && file.isExecutable())]);
                    }
                }

                return util.Array.flatten(commands);
            }
        },

        sidebar: function sidebar(context)
        {
            let menu = document.getElementById("viewSidebarMenu");
            context.title = ["Sidebar Panel"];
            context.completions = Array.map(menu.childNodes, function (n) [n.label, ""]);
        },

        alternateStylesheet: function alternateStylesheet(context)
        {
            context.title = ["Stylesheet", "Location"];
            context.keys = { text: "title", description: function (item) item.href };

            // unify split style sheets
            let completions = buffer.alternateStyleSheets;
            completions.forEach(function (stylesheet) {
                stylesheet.href = stylesheet.href || "inline";
                completions = completions.filter(function (sheet) {
                    if (stylesheet.title == sheet.title && stylesheet != sheet)
                    {
                        stylesheet.href += ", " + sheet.href;
                        return false;
                    }
                    return true;
                });
            });
        },

        // filter a list of urls
        //
        // may consist of search engines, filenames, bookmarks and history,
        // depending on the 'complete' option
        // if the 'complete' argument is passed like "h", it temporarily overrides the complete option
        url: function url(context, complete)
        {
            var numLocationCompletions = 0; // how many async completions did we already return to the caller?
            var start = 0;
            var skip = context.filter.match("^.*" + options["urlseparator"]); // start after the last 'urlseparator'
            if (skip)
                context.advance(skip[0].length);

            // Will, and should, throw an error if !(c in opts)
            Array.forEach(complete || options["complete"],
                function (c) context.fork(c, 0, completion, completion.urlCompleters[c].completer));
        },

        urlCompleters: {},

        addUrlCompleter: function addUrlCompleter(opt)
        {
            this.urlCompleters[opt] = UrlCompleter.apply(null, Array.slice(arguments));
        },

        userCommand: function userCommand(context)
        {
            context.title = ["User Command", "Definition"];
            context.keys = { text: "name", description: "replacementText" };
            context.completions = commands.getUserCommands();
        },

        userMapping: function userMapping(context, args, modes)
        {
            if (args.completeArg == 0)
            {
                let maps = [[m.names[0], ""] for (m in mappings.getUserIterator(modes))];
                context.completions = maps;
            }
        }
    // }}}
    };

    const UrlCompleter = new Struct("name", "description", "completer");
    self.addUrlCompleter("S", "Suggest engines", self.searchEngineSuggest);
    self.addUrlCompleter("b", "Bookmarks", self.bookmark);
    self.addUrlCompleter("h", "History", self.history);
    self.addUrlCompleter("f", "Local files", self.file);
    self.addUrlCompleter("l", "Firefox location bar entries (bookmarks and history sorted in an intelligent way)", self.location);
    self.addUrlCompleter("s", "Search engines and keyword URLs", self.search);

    return self;
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
