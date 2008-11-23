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

    if (editor instanceof arguments.callee)
    {
        let parent = editor;
        name = parent.name + "/" + name;
        this.contexts = parent.contexts;
        if (name in this.contexts)
        {
            let self = this.contexts[name];
            self.offset = parent.offset + (offset || 0);
            return self;
        }
        this.contexts[name] = this;
        this.top = parent.top;
        this.parent = parent;
        this.editor = parent.editor;
        this.offset = parent.offset + (offset || 0);
        this.__defineGetter__("contextList", function () this.top.contextList);
        this.__defineGetter__("onUpdate", function () this.top.onUpdate);
        this.__defineGetter__("selectionTypes", function () this.top.selectionTypes);
        this.__defineGetter__("tabPressed", function () this.top.tabPressed);
        this.__defineGetter__("updateAsync", function () this.top.updateAsync);
        this.__defineGetter__("value", function () this.top.value);
        this.incomplete = false;
    }
    else
    {
        if (typeof editor == "string")
            this._value = editor;
        else
            this.editor = editor;
        this.top = this;
        this.offset = offset || 0;
        this.tabPressed = false;
        this.onUpdate = function () true;
        this.contexts = { name: this };
        this.__defineGetter__("incomplete", function () this.contextList.some(function (c) c.parent && c.incomplete));
        this.selectionTypes = {};
        this.reset();
    }
    this.name = name || "";
    this.cache = {};
    this._items = []; // FIXME
}
CompletionContext.prototype = {
    // Temporary
    get allItems()
    {
        let minStart = Math.min.apply(Math, [context.offset for ([k, context] in Iterator(this.contexts)) if (context.items.length && context.hasItems)]);
        let items = [];
        for each (let [k, context] in Iterator(this.contexts))
        {
            let prefix = this.value.substring(minStart, context.offset);
            if (context.hasItems)
            {
                items.push(context.items.map(function (item) {
                    if (!("text" in item))
                        item = { icon: item[2], text: item[0], description: item[1] };
                    else // FIXME
                        item = util.Array.assocToObj([x for (x in Iterator(item))]);
                    item.text = prefix + item.text;
                    return item;
                }));
            }
        }
        return { start: minStart, items: util.Array.flatten(items) }
    },

    get caret() (this.editor ? this.editor.selection.getRangeAt(0).startOffset : this.value.length) - this.offset,

    get createRow() this._createRow || template.completionRow, // XXX
    set createRow(createRow) this._createRow = createRow,

    get filter() this.value.substr(this.offset, this.caret),

    get items() this._items,
    set items(items)
    {
        this.hasItems = items.length > 0;
        this._items = items;
        if (this.updateAsync)
            liberator.callInMainThread(function () { this.onUpdate.call(this) });
    },

    get title() this._title || ["Completions"], // XXX
    set title(val) this._title = val,

    advance: function advance(count)
    {
        this.offset += count;
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

            completion.filterMap = [null, function highlight(v) template.highlight(v, true)];

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

        this.filter = function filter(compl, key, last, offset)
        {
            if (last != undefined) // Escaping the key (without adding quotes), so it matches the escaped completions.
                key = util.escapeString(key.substr(offset), "");

            let res = buildLongestStartingSubstring(compl, key);
            if (res.length == 0)
            {
                substrings = [];
                res = buildLongestCommonSubstring(compl, key);
            }

            if (last != undefined) // Prepend the quote delimiter to the substrings list, so it's not stripped on <Tab>
                substrings = substrings.map(function (s) last + s);

            if (last != undefined) // We're looking for a quoted string, so, strip whatever prefix we have and quote the rest
            {
                res.forEach(function strEscape(a) a[0] = util.escapeString(a[0].substr(offset), last));
            }
            else // We're not looking for a quoted string, so filter out anything that's not a valid identifier
            {
                res = res.filter(function isIdent(a) /^[\w$][\w\d$]*$/.test(a[0]));
            }
            return res;
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
                // liberator.dump(util.escapeString(string) + ": " + e + "\n" + e.stack);
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
                    let ctxt = this.context.fork(obj[1], top[OFFSET]);
                    ctxt.title = [obj[1]];
                    ctxt.items = this.filter(compl || this.objectKeys(obj), key + (string || ""), last, key.length);
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
            var complist = item[0] instanceof Array ?  item[0]
                                                    : [item[0]];
            for (let [,compitem] in Iterator(complist))
            {
                let str = !ignorecase ? compitem : String(compitem).toLowerCase();

                if (str.indexOf(filter) == -1)
                    continue;

                filtered.push([compitem, item[1], favicon ? item[2] : null]);

                if (longest)
                    buildSubstrings(str, filter);
                break;
            }
        }
        if (options.get("wildoptions").has("sort"))
            filtered = filtered.sort(function (a, b) util.compareIgnoreCase(a[0], b[0]));;
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
            var complist = item[0] instanceof Array ?  item[0]
                                                    : [item[0]];
            for (let [,compitem] in Iterator(complist))
            {
                if (compitem.indexOf(filter) != 0)
                    continue;

                filtered.push([compitem, item[1], favicon ? item[2] : null]);

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
        if (options.get("wildoptions").has("sort"))
            filtered = filtered.sort(function (a, b) util.compareIgnoreCase(a[0], b[0]));;
        return filtered;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

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
        get longestSubstring () substrings.reduce(function (a, b) a.length > b.length ? a : b, ""),

        get substrings() substrings.slice(),

        // generic filter function, also builds substrings needed
        // for :set wildmode=list:longest, if necessary
        filter: function filter(array, filter, matchFromBeginning, favicon)
        {
            if (!filter)
                return [[a[0], a[1], favicon ? a[2] : null] for each (a in array)];

            let result;
            if (matchFromBeginning)
                result = buildLongestStartingSubstring(array, filter, favicon);
            else
                result = buildLongestCommonSubstring(array, filter, favicon);
            return result;
        },

        cached: function cached(key, filter, generate, method)
        {
            if (!filter && cacheFilter[key] || filter.indexOf(cacheFilter[key]) != 0)
                cacheResults[key] = generate(filter);
            cacheFilter[key] = filter;
            if (cacheResults[key].length)
                return cacheResults[key] = this[method].apply(this, [cacheResults[key], filter].concat(Array.slice(arguments, 4)));
             return [];
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

            if (filter.split(/\s+/).every(function strIndex(str) itemsStr.indexOf(str) > -1))
                return true;

            return false;
        },

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// COMPLETION TYPES ////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        autocmdEvent: function autocmdEvent(filter) [0, this.filter(config.autocommands, filter)],

        bookmark: function bookmark(filter)
        {
            return {
                start: 0,
                get items() {
                    return bookmarks.get(filter).map(function (bmark) {
                        // temporary, until we have moved all completions to objects
                        bmark[0] = bmark.url;
                        bmark[1] = bmark.title;

                        bmark.text = bmark.url;
                        return bmark;
                    });
                },
            };
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
            let schemes = [];
            let rtp = options["runtimepath"].split(",");

            rtp.forEach(function (path) {
                // FIXME: Now! Very, very broken.
                schemes = schemes.concat([[c[0].replace(/\.vimp$/, ""), ""]
                    for each (c in completion.file(path + "/colors/", true)[1])]);
            });

            return [0, completion.filter(schemes, filter)];
        },

        command: function command(context)
        {
            context.title = ["Command"];
            if (!context.filter)
                context.items = [[c.name, c.description] for (c in commands)];
            else
                context.items = this.filter([[c.longNames, c.description] for (c in commands)], context.filter, true);
        },

        dialog: function dialog(filter) [0, this.filter(config.dialogs, filter)],

        directory: function directory(context, tail)
        {
            this.file(context, tail);
            context.items = context.items.filter(function (i) i[1] == "Directory");
        },

        environment: function environment(filter)
        {
            let command = liberator.has("Win32") ? "set" : "env";
            let lines = io.system(command).split("\n");

            lines.pop();

            let vars = lines.map(function (line) {
                let matches = line.match(/([^=]+)=(.+)/) || [];
                return [matches[1], matches[2]];
            });

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
            context.items = []; // XXX
            if (!junk)
                return this.command(context);

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
                    // XXX, XXX, XXX
                    if (!args.completeOpt && command.completer)
                    {
                        cmdContext.advance(args.completeStart);
                        compObject = command.completer.call(command, cmdContext, args, special, count);
                        if (compObject instanceof Array) // for now at least, let completion functions return arrays instead of objects
                            compObject = { start: compObject[0], items: compObject[1] };
                        if (compObject != null)
                        {
                            cmdContext.advance(compObject.start);
                            cmdContext.title = ["Completions"];
                            cmdContext.items = compObject.items;
                        }
                    }
                    cmdContext.updateAsync = true;
                }
                //liberator.dump([[v.name, v.offset, v.items.length, v.hasItems] for each (v in context.contexts)]);
            }
        },

        // TODO: support file:// and \ or / path separators on both platforms
        // if "tail" is true, only return names without any directory components
        file: function file(context, tail)
        {
            let [dir] = context.filter.match(/^(?:.*[\/\\])?/);
            // dir == "" is expanded inside readDirectory to the current dir

            let generate = function generate()
            {
                let files = [], mapped = [];

                try
                {
                    dir = dir.replace("\\ ", " ", "g");
                    files = io.readDirectory(dir, true);

                    if (options["wildignore"])
                    {
                        let wigRegexp = RegExp("(^" + options["wildignore"].replace(",", "|", "g") + ")$");

                        files = files.filter(function (f) f.isDirectory() || !wigRegexp.test(f.leafName))
                    }

                    mapped = files.map(
                        function (file) [(tail ? file.leafName : dir + file.leafName).replace(" ", "\\ ", "g"),
                            file.isDirectory() ? "Directory" : "File"]
                    );
                }
                catch (e) {}

                return mapped;
            };

            context.title = ["Path", "Type"];
            if (tail)
                context.advance(dir.length);
            context.items = this.cached("file-" + dir, context.filter, generate, "filter", true);
        },

        help: function help(filter)
        {
            let res = [];

            for (let [, file] in Iterator(config.helpFiles))
            {
                try
                {
                    var xmlhttp = new XMLHttpRequest();
                    xmlhttp.open("GET", "chrome://liberator/locale/" + file, false);
                    xmlhttp.send(null);
                }
                catch (e)
                {
                    liberator.log("Error opening chrome://liberator/locale/" + file, 1);
                    continue;
                }
                let doc = xmlhttp.responseXML;
                res.push(Array.map(doc.getElementsByClassName("tag"),
                        function (elem) [elem.textContent, file]));
            }

            return [0, this.filter(util.Array.flatten(res), filter)];
        },

        highlightGroup: function highlightGroup(filter) commands.get("highlight").completer(filter), // XXX

        get javascriptCompleter() javascript,

        javascript: function _javascript(context)
        {
            return javascript.complete(context);
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
            let engines = this.filter(keywords.concat(bookmarks.getSearchEngines()), context.filter, false, true);

            context.title = ["Search Keywords"];
            context.items = engines;

            // TODO: Simplify.
            for (let [,item] in Iterator(keywords))
            {
                let name = item.keyword;
                if (space && keyword == name && item.url.indexOf("%s") > -1)
                    context.fork(name, name.length + space.length, function (context) {
                        let [begin, end] = item.url.split("%s");
                        let history = modules.history.service;
                        let query = history.getNewQuery();
                        let opts = history.getNewQueryOptions();

                        query.uri = window.makeURI(begin);
                        query.uriIsPrefix = true;
                        opts.resultType = opts.RESULTS_AS_URI;
                        opts.queryType = opts.QUERY_TYPE_HISTORY;

                        context.title = [keyword + " Quick Search"];
                        function setItems()
                        {
                            context.items = completion.filter(context.cache.items, args, false, true);
                        }

                        if (context.cache.items)
                            setItems();
                        else
                        {
                            context.incomplete = true;
                            liberator.callFunctionInThread(null, function () {
                                let results = history.executeQuery(query, opts);
                                let root = results.root;
                                    root.containerOpen = true;
                                    context.cache.items = util.map(util.range(0, root.childCount), function (i) {
                                        let child = root.getChild(i);
                                        let rest = child.uri.length - end.length;
                                        let query = child.uri.substring(begin.length, rest);
                                        if (child.uri.substr(rest) == end && query.indexOf("&") == -1)
                                            return [decodeURIComponent(query.replace("+", "%20")),
                                                    child.title,
                                                    child.icon];
                                    }).filter(function (k) k);
                                    root.containerOpen = false;
                                    context.incomplete = false;
                                    setItems();
                            });
                        }
                    });
            }
        },

        // XXX: Move to bookmarks.js?
        searchEngineSuggest: function searchEngineSuggest(context, engineAliases)
        {
            if (!filter)
                return [0, []];

            let engineList = (engineAliases || options["suggestengines"] || "google").split(",");
            let responseType = "application/x-suggestions+json";
            let ss = Components.classes["@mozilla.org/browser/search-service;1"]
                               .getService(Components.interfaces.nsIBrowserSearchService);
            let matches = query.match(RegExp("^\s*(" + name + "\\s+)(.*)$")) || [];
            if (matches[1])
                context.advance(matches[1].length);
            query = context.filter;

            let completions = [];
            engineList.forEach(function (name) {
                let engine = ss.getEngineByAlias(name);

                if (engine && engine.supportsResponseType(responseType))
                    var queryURI = engine.getSubmission(query, responseType).uri.asciiSpec;
                else
                    return;

                let xhr = new XMLHttpRequest();
                xhr.open("GET", queryURI, false);
                xhr.send(null);

                let json = Components.classes["@mozilla.org/dom/json;1"]
                                     .createInstance(Components.interfaces.nsIJSON);
                let results = json.decode(xhr.responseText)[1];
                if (!results)
                    return;

                let ctxt = context.fork(engine.name, (matches[1] || "").length);
                ctxt.title = [engine.name + " Suggestions"];
                // make sure we receive strings, otherwise a man-in-the-middle attack
                // could return objects which toString() method could be called to
                // execute untrusted code
                ctxt.items = [[item, ""] for ([k, item] in results) if (typeof item == "string")];
            });
        },

        shellCommand: function shellCommand(filter)
        {
            let generate = function generate()
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
                        io.readDirectory(dir).forEach(function (file) {
                            if (file.isFile() && file.isExecutable())
                                commands.push([file.leafName, dir.path]);
                        });
                    }
                }

                return commands;
            }

            return [0, this.cached("shell-command", filter, generate, "filter")];
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
                for (let i = 0; i < completions.length; i++)
                {
                    if (stylesheet[0] == completions[i][0] && stylesheet[1] != completions[i][1])
                    {
                        stylesheet[1] += ", " + completions[i][1];
                        completions.splice(i, 1);
                    }
                }
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

            let opts = {
                s: this.search,
                f: this.file,
                S: this.searchEngineSuggest,
                b: function b(context)
                {
                    context.title = ["Bookmark", "Title"];
                    context.createRow = function createRow(context, item, class)
                    {
                        // FIXME
                        if (class)
                            return template.completionRow(context, item, class);
                        return template.bookmarkItem(item);
                    }
                    context.items = bookmarks.get(context.filter)
                },
                l: function l(context)
                {
                    if (!completionService)
                        return
                    context.title = ["Smart Completions"];
                    context.incomplete = true;
                    context.hasItems = context.items.length > 0; // XXX
                    let timer = new util.Timer(50, 100, function (result) {
                        context.items = [
                                [result.getValueAt(i), result.getCommentAt(i), result.getImageAt(i)]
                                for (i in util.range(0, result.matchCount))
                        ];
                        context.incomplete = result.searchResult >= result.RESULT_NOMATCH_ONGOING;
                        let filter = context.filter;
                        context.items.forEach(function ([item]) buildSubstrings(item, filter));
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
                    
                }
            };
            Array.forEach(complete || options["complete"],
                function (c) context.fork(c, 0, opts[c], completion));
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
            liberator.dump(args);
            if (args.completeArg == 0)
            {
                let maps = [[m.names[0], ""] for (m in mappings.getUserIterator(modes))];
                context.items = this.filter(maps, args.arguments[0]);
            }
        }
    // }}}
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
