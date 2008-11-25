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
    if (!name)
        name = "";

    let self = this;
    if (editor instanceof arguments.callee)
    {
        let parent = editor;
        name = parent.name + "/" + name;
        this.contexts = parent.contexts;
        if (name in this.contexts)
        {
            self = this.contexts[name];
            self.offset = parent.offset + (offset || 0);
            return self;
        }
        this.contexts[name] = this;
        this.anchored = parent.anchored;
        this.parent = parent;
        this.offset = parent.offset + (offset || 0);
        this.keys = util.cloneObject(this.parent.keys);
        ["compare", "editor", "filterFunc", "keys", "title", "top"].forEach(function (key)
            self[key] = parent[key]);
        ["contextList", "onUpdate", "selectionTypes", "tabPressed", "updateAsync", "value"].forEach(function (key) {
            self.__defineGetter__(key, function () this.top[key]);
            self.__defineSetter__(key, function (val) this.top[key] = val);
        });
        this.incomplete = false;
    }
    else
    {
        if (typeof editor == "string")
            this._value = editor;
        else
            this.editor = editor;
        this.compare = function (a, b) String.localeCompare(a.text, b.text);
        this.filterFunc = completion.filter;
        this.keys = { text: 0, description: 1, icon: "icon" };
        this.offset = offset || 0;
        this.onUpdate = function () true;
        this.tabPressed = false;
        this.title = ["Completions"];
        this.top = this;
        this.contexts = { name: this };
        this.__defineGetter__("incomplete", function () this.contextList.some(function (c) c.parent && c.incomplete));
        this.selectionTypes = {};
        this.reset();
    }
    this.name = name || "";
    this.cache = {};
    this.process = [];
    this._completions = []; // FIXME
    this.getKey = function (item, key) item.item[self.keys[key]];
}
CompletionContext.prototype = {
    // Temporary
    get allItems()
    {
        let self = this;
        let minStart = Math.min.apply(Math, [context.offset for ([k, context] in Iterator(this.contexts)) if (context.items.length && context.hasItems)]);
        let items = this.contextList.map(function (context) {
            if (!context.hasItems)
                return [];
            let prefix = self.value.substring(minStart, context.offset);
            return [{ text: prefix + item.text, item: item.item } for ([i, item] in Iterator(context.items))];
        });
        return { start: minStart, items: util.Array.flatten(items) }
    },

    get caret() (this.editor ? this.editor.selection.getRangeAt(0).startOffset : this.value.length) - this.offset,

    get completions() this._completions || [],
    set completions(items)
    {
        delete this.cache.filtered;
        delete this.cache.filter;
        this.cache.rows = [];
        this.hasItems = items.length > 0;
        this._completions = items;
        let self = this;
        if (this.updateAsync)
            liberator.callInMainThread(function () { self.onUpdate.call(self) });
    },

    get createRow() this._createRow || template.completionRow, // XXX
    set createRow(createRow) this._createRow = createRow,

    get filterFunc() this._filterFunc || function (items) items,
    set filterFunc(val) this._filterFunc = val,

    get regenerate() this._generate && (!this.completions || this.cache.key != this.key || this.cache.offset != this.offset),
    set regenerate(val) { if (val) delete this.cache.offset },

    get generate() !this._generate ? null : function ()
    {
        let updateAsync = this.updateAsync; // XXX
        this.updateAsync = false;
        this.completions = this._generate.call(this);
        this.updateAsync = updateAsync;

        this.cache.offset = this.offset;
        this.cache.key = this.key;
        return this.completions;
    },
    set generate(arg)
    {
        let self = this;
        this.hasItems = true;
        this._generate = arg;
        if (this.background && this.regenerate)
        {
            let lock = {};
            this.cache.backgroundLock = lock;
            this.incomplete = true;
            liberator.callFunctionInThread(null, function () {
                let items = self.generate();
                if (self.backgroundLock != lock)
                    return;
                self.incomplete = false;
                self.completions = items;
            });
        }
    },

    get filter() this._filter || this.value.substr(this.offset, this.caret),
    set filter(val) this._filter = val,

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

    get items()
    {
        if (!this.hasItems)
            return [];
        if (this.cache.filtered && this.cache.filter == this.filter)
            return this.cache.filtered;
        this.cache.rows = [];
        let items = this.completions;
        if (this.regenerate)
            items = this.generate();
        this.cache.filter = this.filter;
        if (items == null)
            return items;

        let self = this;
        let text = function (item) item[self.keys["text"]];
        if (self.quote)
            text = function (item) self.quote(item[self.keys["text"]]);

        completion.getKey = this.getKey; // XXX
        this.cache.filtered = this.filterFunc(items.map(function (item) ({ text: text(item), item: item })),
                    this.filter, this.anchored);
        if (options.get("wildoptions").has("sort"))
            this.cache.filtered.sort(this.compare);
        completion.getKey = null;

        return this.cache.filtered;
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

    advance: function advance(count)
    {
        this.offset += count;
    },

    getItems: function (start, end)
    {
        let self = this;
        let items = this.items;
        let reverse = start > end;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end ? end : items.length);
        return util.map(util.range(start, end, reverse), function (i) items[i]);
    },

    getRows: function (start, end, doc)
    {
        let self = this;
        let items = this.items;
        let cache = this.cache.rows;
        let reverse = start > end;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end ? end : items.length);
        return util.map(util.range(start, end, reverse),
            function (i) cache[i] = cache[i] || util.xmlToDom(self.createRow(items[i]), doc));
    },

    fork: function fork(name, offset, completer, self)
    {
        let context = new CompletionContext(this, name, offset);
        this.contextList.push(context);
        if (completer)
            return completer.apply(self, [context].concat(Array.slice(arguments, 4)));
        return context;
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
        this.selectionTypes = {};
        this.tabPressed = false;
        this.updateAsync = false;
        this.value = this.editor ? this.editor.rootElement.textContent : this._value;
        //for (let key in (k for ([k, v] in Iterator(self.contexts)) if (v.offset > this.caret)))
        //    delete this.contexts[key];
        for each (let context in this.contexts)
        {
            context.hasItems = false;
            context.incomplete = false;
        }
    },
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
    const cleanEval = _cleanEval;
    delete modules._cleanEval;

    // the completion substrings, used for showing the longest common match
    var cacheFilter = {}
    var cacheResults = {}
    var substrings = [];
    var historyCache = [];

    function Javascript()
    {
        let json = Components.classes["@mozilla.org/dom/json;1"]
                             .createInstance(Components.interfaces.nsIJSON);
        const OFFSET = 0, CHAR = 1, STATEMENTS = 2, DOTS = 3, FULL_STATEMENTS = 4, FUNCTIONS = 5;
        let stack = [];
        let top = [];  /* The element on the top of the stack. */
        let last = ""; /* The last opening char pushed onto the stack. */
        let lastNonwhite = ""; /* Last non-whitespace character we saw. */
        let lastChar = "";     /* Last character we saw, used for \ escaping quotes. */
        let compl = [];
        let str = "";

        let lastIdx = 0;
        let continuing = false;

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
        this.objectKeys = function objectKeys(objects)
        {
            if (!(objects instanceof Array))
                objects = [objects];

            let [obj, key] = objects;
            let cache = this.context.cache.objects || {};
            this.context.cache.objects = cache;
            if (key in cache)
                return cache[key];

            // Can't use the cache. Build a member list.
            let compl = [];
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
            compl.push([v for (v in this.iter(obj)) if (v[0] in orig || orig[v[0]] !== undefined)])
            // And if wrappedJSObject happens to be available,
            // return that, too.
            if (orig.wrappedJSObject)
                compl.push([["wrappedJSObject", obj]]);
            compl = util.Array.flatten(compl);
            return cache[key] = compl;
        }

        this.filter = function filter(context, compl, name, anchored, key, last, offset)
        {
            context.title = [name];
            context.anchored = anchored;
            context.filter = key;
            context.process = [null, function highlight(item, v) template.highlight(v, true)];

            if (last != undefined) // Escaping the key (without adding quotes), so it matches the escaped completions.
                key = util.escapeString(key.substr(offset), "");

            if (last != undefined) // Prepend the quote delimiter to the substrings list, so it's not stripped on <Tab>
                substrings = substrings.map(function (s) last + s);

            let res;
            if (last != undefined) // We're looking for a quoted string, so, strip whatever prefix we have and quote the rest
                res = compl.map(function (a) [util.escapeString(a[0].substr(offset), last), a[1]]);
            else // We're not looking for a quoted string, so filter out anything that's not a valid identifier
                res = compl.filter(function isIdent(a) /^[\w$][\w\d$]*$/.test(a[0]));
            if (!anchored)
                res = res.filter(function ([k]) util.compareIgnoreCase(k.substr(0, key.length), key));
            context.completions = res;
        }

        this.eval = function eval(arg, key, tmp)
        {
            if (!("eval" in this.context.cache))
                this.context.cache.eval = {};
            let cache = this.context.cache.eval;
            if (!key)
                key = arg;

            if (key in cache)
                return cache[key];

            try
            {
                return cache[key] = cleanEval(arg, tmp);
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

            let i = start, c = "";     /* Current index and character, respectively. */

            // We're starting afresh.
            if (start == 0)
            {
                stack = [];
                push("#root");
            }
            else
            {
                // A new statement may have been pushed onto the stack just after
                // the end of the last string. We'll throw it away for now, and
                // add it again later if it turns out to be valid.
                let s = top[STATEMENTS];
                if (s[s.length - 1] == start)
                    s.pop();
            }

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
                continuing = lastIdx && string.indexOf(str) == 0;
                str = string;
                buildStack.call(this, continuing ? lastIdx : 0);
            }
            catch (e)
            {
                if (e.message != "Invalid JS")
                    liberator.reportError(e);
                lastIdx = 0;
                return;
            }

            /* Okay, have parse stack. Figure out what we're completing. */

            // Find any complete statements that we can eval before we eval our object.
            // This allows for things like: let doc = window.content.document; let elem = doc.createElement...; elem.<Tab>
            let prev = 0;
            for (let [,v] in Iterator(get(0)[FULL_STATEMENTS]))
            {
                    this.eval(str.substring(prev, v + 1));
                    prev = v + 1;
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
                    prev = dot + 1;
                    cacheKey = str.substring(statement, dot);
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

            function complete(objects, key, compl, string, last)
            {
                for (let [,obj] in Iterator(objects))
                {
                    obj[3] = compl || this.objectKeys(obj);
                    this.context.fork(obj[1], top[OFFSET], this.filter, this,
                        obj[3], obj[1], true, key + (string || ""), last, key.length);
                }
                for (let [,obj] in Iterator(objects))
                {
                    obj[1] += " (substrings)";
                    this.context.fork(obj[1], top[OFFSET], this.filter, this,
                        obj[3], obj[1], false, key + (string || ""), last, key.length);
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
                    let args = get(-2)[FULL_STATEMENTS].map(function splitArgs(s)
                    {
                        let ret = str.substring(prev + 1, s);
                        prev = s;
                        return ret;
                    });
                    args.push(key);

                    let compl = completer.call(this, func, obj[0][0], string, args);
                    if (!(compl instanceof Array))
                        compl = [v for (v in compl)];
                    key = this.eval(key);
                    obj[0][1] += "." + func + "(...";
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

    function buildSubstrings(str, filter)
    {
        if (substrings.length)
        {
            substrings = substrings.filter(function strIndex(s) str.indexOf(s) >= 0);
            return;
        }
        if (filter == "")
            return;
        let length = filter.length;
        let start = 0;
        let idx;
        while ((idx = str.indexOf(filter, start)) > -1)
        {
            for (let end in util.range(idx + length, str.length + 1))
                substrings.push(str.substring(idx, end));
            start = idx + 1;
        }
    }

    // function uses smartcase
    // list = [ [['com1', 'com2'], 'text'], [['com3', 'com4'], 'text'] ]
    function buildLongestCommonSubstring(list, filter, favicon)
    {
        var filtered = [];

        var ignorecase = false;
        if (filter == filter.toLowerCase())
            ignorecase = true;

        var longest = false;
        if (options["wildmode"].indexOf("longest") >= 0)
            longest = true;

        for (let [,item] in Iterator(list))
        {
            let text = completion.getKey(item, "text");
            var complist = text instanceof Array ? text : [text];
            for (let [,compitem] in Iterator(complist))
            {
                let str = !ignorecase ? compitem : String(compitem).toLowerCase();

                if (str.indexOf(filter) == -1)
                    continue;

                item.text = compitem;
                filtered.push(item);

                if (longest)
                    buildSubstrings(str, filter);
                break;
            }
        }
        return filtered;
    }

    // this function is case sensitive
    function buildLongestStartingSubstring(list, filter, favicon)
    {
        var filtered = [];

        var longest = false;
        if (options["wildmode"].indexOf("longest") >= 0)
            longest = true;

        for (let [,item] in Iterator(list))
        {
            let text = completion.getKey(item, "text");
            var complist = text instanceof Array ?  text : [text];
            for (let [,compitem] in Iterator(complist))
            {
                if (compitem.substr(0, filter.length) != filter)
                    continue;

                item.text = compitem;
                filtered.push(item);

                if (longest)
                {
                    if (substrings.length == 0)
                    {
                        var length = compitem.length;
                        for (let k = filter.length; k <= length; k++)
                            substrings.push(compitem.substring(0, k));
                    }
                    else
                    {
                        substrings = substrings.filter(function strIndex(s) compitem.indexOf(s) == 0);
                    }
                }
                break;
            }
        }
        return filtered;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    let self = {

        // FIXME
        get getKey() this._getKey || function (item, key) item[{ text: 0, description: 1, icon: 2 }[key]],
        set getKey(getKey) this._getKey = getKey,

        setFunctionCompleter: function setFunctionCompleter(funcs, completers)
        {
            if (!(funcs instanceof Array))
                funcs = [funcs];
            for (let [,func] in Iterator(funcs))
            {
                func.liberatorCompleter = function liberatorCompleter(func, obj, string, args) {
                    let completer = completers[args.length - 1];
                    if (!completer)
                        return [];
                    return completer.call(this, this.eval(obj), this.eval(args.pop()) + string, args);
                };
            }
        },

        // returns the longest common substring
        // used for the 'longest' setting for wildmode
        get longestSubstring() substrings.reduce(function (a, b) a.length > b.length ? a : b, ""),

        get substrings() substrings.slice(),

        runCompleter: function (name, filter)
        {
            let context = new CompletionContext(filter);
            context.__defineGetter__("background", function () false);
            context.__defineSetter__("background", function () false);
            this[name](context);
            return context.items.map(function (i) i.item);
        },

        // generic filter function, also builds substrings needed
        // for :set wildmode=list:longest, if necessary
        filter: function filter(array, filter, matchFromBeginning)
        {
            if (matchFromBeginning)
                return buildLongestStartingSubstring(array, filter);
            return buildLongestCommonSubstring(array, filter);
        },

        // cancel any ongoing search
        cancel: function cancel()
        {
            if (completionService)
                completionService.stopSearch();
        },

        // discard all entries in the 'urls' array, which don't match 'filter
        // urls must be of type [{url: "..", title: "..", tags: [...], keyword: ".."}, ...]
        filterURLArray: function filterURLArray(urls, filter, filterTags)
        {
            var filtered = [];
            // completions which don't match the url but just the description
            // list them at the end of the array
            var additionalCompletions = [];

            if (urls.length == 0)
                return [];

            var hasTags = urls[0].tags !== undefined;
            // TODO: create a copy of urls?
            if (!filter && (!hasTags || !filterTags))
                return urls;

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
                var url   = elem.url || "";
                var title = elem.title || "";
                var tags  = elem.tags || [];
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

                // TODO: refactor out? And just build if wildmode contains longest?
                //   Of course --Kris
                if (substrings.length == 0)   // Build the substrings
                    buildSubstrings(url, filter);
                else
                    substrings = substrings.filter(function strIndex(s) url.indexOf(s) >= 0);

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

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// COMPLETION TYPES ////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        autocmdEvent: function autocmdEvent(filter) [0, this.filter(config.autocommands, filter)],

        bookmark: function bookmark(context)
        {
            context.title = ["Bookmark", "Title"];
            context.format = bookmarks.format;
            context.completions = bookmarks.get(context.filter)
        },

        buffer: function buffer(filter)
        {
            // FIXME: liberator.has("tabs")
            let items = [];
            let xml = <table/>
            filter = (filter || "").toLowerCase();

            for (let [i, browser] in tabs.browsers)
            {
                if (i == tabs.index())
                   indicator = "%"
                else if (i == tabs.index(tabs.alternate))
                   indicator = "#";
                else
                   indicator = " ";

                i = i + 1;
                let title = "";
                try
                {
                    title = browser.contentDocument.title;
                }
                catch (e) {}

                let url = browser.contentDocument.location.href;

                if (title.indexOf(filter) != -1 || url.indexOf(filter) != -1 ||
                        String.indexOf(i, filter) != -1)
                {
                    if (title == "")
                        title = "(Untitled)";

                    items.push([[i + ": " + title, i + ": " + url], url]);

                    let icon = "";
                    if (liberator.has("bookmarks"))
                        icon = bookmarks.getFavicon(url);

                    xml.* +=
                        <ul class="hl-CompItem">
                            <li align="right">  {i}</li>
                            <li><span class="hl-Indicator"> {indicator} </span></li>
                            <li class="hl-CompIcon">{icon ? <img src={icon}/> : <></>}</li>
                            <li class="hl-CompResult" style="width: 250px; max-width: 500px; overflow: hidden">{title}</li>
                            <li class="hl-CompDesc"><a href="#" class="hl-URL buffer-list">{url}</a></li>
                        </ul>;
                }
            }

            if (!filter)
                return [0, items.map(function ([a, b]) [a[0], b]), xml];

            return [0, buildLongestCommonSubstring(items, filter), xml];
        },

        colorScheme: function colorScheme(filter)
        {
            let rtp = options["runtimepath"].split(",");
            let schemes = rtp.map(function (path) // FIXME: Now! Very, very broken.
                [[c[0].replace(/\.vimp$/, ""), ""]
                    for each (c in completion.file(path + "/colors/", true)[1])]);

            return [0, completion.filter(util.Array.flatten(schemes), filter)];
        },

        command: function command(context)
        {
            context.title = ["Command"];
            context.anchored = true;
            context.keys = { text: "longNames", description: "description" };
            context.completions = [k for (k in commands)];
        },

        dialog: function dialog(filter) [0, this.filter(config.dialogs, filter)],

        directory: function directory(context, tail)
        {
            this.file(context, tail);
            context.completions = context.completions.filter(function (i) i[1] == "Directory");
        },

        environment: function environment(filter)
        {
            let command = liberator.has("Win32") ? "set" : "env";
            let lines = io.system(command).split("\n");

            lines.pop();

            let vars = lines.map(function (line) (line.match(/([^=]+)=(.+)/) || []).slice(1));

            return [0, this.filter(vars, filter)];
        },

        // provides completions for ex commands, including their arguments
        ex: function ex(context)
        {
            this.filterMap = null;
            substrings = [];
            if (context.filter.indexOf(cacheFilter["ex"]) != 0)
            {
                cacheFilter = {};
                cacheResults = {};
            }
            cacheFilter["ex"] = context.filter;

            // if there is no space between the command name and the cursor
            // then get completions of the command name
            let [count, cmd, special, args] = commands.parseCommand(context.filter);
            let [, prefix, junk] = context.filter.match(/^(:*\d*)\w*(.?)/) || [];
            context.advance(prefix.length)
            if (!junk)
                return context.fork("", 0, this.command);

            // dynamically get completions as specified with the command's completer function
            let command = commands.get(cmd);
            let compObject = { start: 0, items: [] };
            if (command)
            {
                [prefix] = context.filter.match(/^(?:\w*[\s!]|!)\s*/);
                let cmdContext = context.fork(cmd, prefix.length);
                let argContext = cmdContext.fork("args", args.completeStart);
                args = command.parseArgs(cmdContext.filter, argContext);
                if (args)
                {
                    if (!args.completeOpt && command.completer)
                    {
                        cmdContext.advance(args.completeStart);
                        compObject = command.completer.call(command, cmdContext, args, special, count);
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
            context.key = dir;
            context.generate = function generate()
            {
                context.cache.dir = dir;

                try
                {
                    let files = io.readDirectory(dir, true);

                    if (options["wildignore"])
                    {
                        let wigRegexp = RegExp("(^" + options["wildignore"].replace(",", "|", "g") + ")$");
                        files = files.filter(function (f) f.isDirectory() || !wigRegexp.test(f.leafName))
                    }

                    return files.map(
                        function (file) [(tail ? file.leafName : dir + file.leafName).replace(" ", "\\ ", "g"),
                                         file.isDirectory() ? "Directory" : "File",
                                         "moz-icon://" + makeFileURI(file).path]
                    );
                }
                catch (e) {}
                return [];
            };
        },

        help: function help(context)
        {
            context.title = ["Help"];
            context.background = true;
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

        history: function (context)
        {
            context.format = history.format;
            context.title = ["History"]
            context.background = true;
            context.regenerate = true;
            context.generate = function () history.get({ searchTerms: context.filter });
        },

        get javascriptCompleter() javascript,

        javascript: function _javascript(context)
        {
            return javascript.complete(context);
        },

        location: function (context)
        {
            if (!completionService)
                return
            context.title = ["Smart Completions"];
            context.keys.icon = 2;
            context.incomplete = true;
            context.hasItems = context.completions.length > 0; // XXX
            context.filterFunc = null;
            let timer = new util.Timer(50, 100, function (result) {
                context.completions = [
                    [result.getValueAt(i), result.getCommentAt(i), result.getImageAt(i)]
                        for (i in util.range(0, result.matchCount))
                ];
                context.incomplete = result.searchResult >= result.RESULT_NOMATCH_ONGOING;
                let filter = context.filter;
                context.completions.forEach(function ([item]) buildSubstrings(item, filter));
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

        macro: function macro(filter)
        {
            var macros = [item for (item in events.getMacros())];

            return [0, this.filter(macros, filter)];
        },

        menuItem: function menuItem(filter) commands.get("emenu").completer(filter), // XXX

        option: function option(filter) commands.get("set").completer(filter), // XXX

        preference: function preference(filter) commands.get("set").completer(filter, true), // XXX

        search: function search(context)
        {
            let [, keyword, space, args] = context.filter.match(/^\s*(\S*)(\s*)(.*)$/);
            let keywords = bookmarks.getKeywords();
            let engines = bookmarks.getSearchEngines();

            context.title = ["Search Keywords"];
            context.keys = { text: 0, description: 1, icon: 2 };
            context.completions = keywords.concat(engines);
            context.anchored = true;

            if (!space)
                return;

            context.fork("suggest", keyword.length + space.length, this.searchEngineSuggest, this,
                    keyword, true);

            let item = keywords.filter(function (k) k.keyword == keyword)[0];
            if (item && item.url.indexOf("%s") > -1)
                context.fork("keyword/" + keyword, keyword.length + space.length, function (context) {
                    context.format = history.format;
                    context.title = [keyword + " Quick Search"];
                    context.background = true;
                    context.anchored = true;
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
                        }).filter(function (k) k);
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
                let [, word] = /^\s*(\S+)/.exec(context.filter) || [];
                if (!kludge && word == name) // FIXME: Check for matching keywords
                    return;
                let ctxt = context.fork(name, 0);

                ctxt.title = [engine.description + " Suggestions"];
                ctxt.regenerate = true;
                ctxt.background = true;
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

        sidebar: function sidebar(filter)
        {
            let menu = document.getElementById("viewSidebarMenu");
            let panels = Array.map(menu.childNodes, function (n) [n.label, ""]);

            return [0, this.filter(panels, filter)];
        },

        alternateStylesheet: function alternateStylesheet(filter)
        {
            let completions = buffer.alternateStyleSheets.map(
                function (stylesheet) [stylesheet.title, stylesheet.href || "inline"]
            );

            // unify split style sheets
            completions.forEach(function (stylesheet) {
                completions = completions.filter(function (completion) {
                    if (stylesheet[0] == completion[0] && stylesheet[1] != completion[1])
                    {
                        stylesheet[1] += ", " + completion[1];
                        return false;
                    }
                    return true;
                });
            });

            return [0, this.filter(completions, filter)];
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
                function (c) context.fork(c, 0, completion.urlCompleters[c].completer, completion));
        },

        urlCompleters: {},

        addUrlCompleter: function (opt)
        {
            this.urlCompleters[opt] = UrlCompleter.apply(null, Array.slice(arguments));
        },

        // FIXME: Temporary
        _url: function _url(filter, complete)
        {
            let context = new CompletionContext(filter);
            this.url(context, complete);
            return context.allItems;
        },

        userCommand: function userCommand(filter)
        {
            let cmds = commands.getUserCommands();
            cmds = cmds.map(function (cmd) [cmd.name, ""]);
            return [0, this.filter(cmds, filter)];
        },

        userMapping: function userMapping(context, args, modes)
        {
            if (args.completeArg == 0)
            {
                let maps = [[m.names[0], ""] for (m in mappings.getUserIterator(modes))];
                context.completions = this.filter(maps, args.arguments[0]);
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
