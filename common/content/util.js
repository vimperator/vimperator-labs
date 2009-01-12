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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@gmx.net>

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

/** @scope modules */

const XHTML = "http://www.w3.org/1999/xhtml";
const NS = Namespace("liberator", "http://vimperator.org/namespaces/liberator");
default xml namespace = XHTML;

const util = { //{{{

    /**
     * Array utility methods.
     * @singleton
     */
    Array: {
        /**
         * Converts an array to an object. As in lisp, an assoc is an
         * array of key-value pairs, which maps directly to an object,
         * as such:
         *    [["a", "b"], ["c", "d"]] -> { a: "b", c: "d" }
         *
         * @param {Array[]} assoc
         * @... {string} 0 - Key
         * @...          1 - Value
         */
        assocToObj: function assocToObj(assoc)
        {
            let obj = {};
            assoc.forEach(function ([k, v]) { obj[k] = v });
            return obj;
        },

        /**
         * Flattens an array, such that all elements of the array are
         * joined into a single array:
         *    [["foo", ["bar"]], ["baz"], "quux"] -> ["foo", ["bar"], "baz", "quux"]
         *
         * @param {Array} ary
         * @returns {Array}
         */
        flatten: function flatten(ary) Array.concat.apply([], ary),

        /**
         * Returns an Iterator for an array's values.
         *
         * @param {Array} ary
         * @returns {Iterator(Object)}
         */
        iterator: function iterator(ary)
        {
            let length = ary.length;
            for (let i = 0; i < length; i++)
                yield ary[i];
        },

        /**
         * Returns an Iterator for an array's indices and values.
         *
         * @param {Array} ary
         * @returns {Iterator([{number}, {Object}])}
         */
        iterator2: function (ary)
        {
            let length = ary.length;
            for (let i = 0; i < length; i++)
                yield [i, ary[i]];
        },

        /**
         * Filters out all duplicates from an array. If
         * <b>unsorted</b> is false, the array is sorted before
         * duplicates are removed.
         *
         * @param {Array} ary
         * @param {boolean} unsorted
         * @returns {Array}
         */
        uniq: function uniq(ary, unsorted)
        {
            let ret = [];
            if (unsorted)
            {
                for (let [,item] in Iterator(ary))
                    if (ret.indexOf(item) == -1)
                        ret.push(item);
            }
            else
            {
                for (let [,item] in Iterator(ary.sort()))
                {
                    if (item != last || !ret.length)
                        ret.push(item);
                    var last = item;
                }
            }
            return ret;
        }
    },

    /**
     * Returns a shallow copy of <b>obj</b>.
     *
     * @param {Object} obj
     * @returns {Object}
     */
    cloneObject: function cloneObject(obj)
    {
        if (obj instanceof Array)
            return obj.slice();
        let newObj = {};
        for (let [k, v] in Iterator(obj))
            newObj[k] = v;
        return newObj;
    },

    /**
     * Clips a string to a given length. If the input string is longer
     * than <b>length</b>, an ellipsis is appended.
     *
     * @param {string} str The string to truncate.
     * @param {number} length The length of the returned string.
     * @returns {string}
     */
    clip: function clip(str, length)
    {
        return str.length <= length ? str : str.substr(0, length - 3) + "...";
    },

    /**
     * Compares two strings, case insensitively. Return values are as
     * in String#localeCompare.
     *
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    compareIgnoreCase: function compareIgnoreCase(a, b) String.localeCompare(a.toLowerCase(), b.toLowerCase()),

    /**
     * Returns an object representing a Node's computed CSS style.
     *
     * @param {Node} node
     * @returns {Object}
     */
    computedStyle: function computedStyle(node)
    {
        while (node instanceof Text && node.parentNode)
            node = node.parentNode;
        return node.ownerDocument.defaultView.getComputedStyle(node, null);
    },

    /**
     * Copies a string to the system clipboard. If <b>verbose</b> is specified
     * the copied string is also echoed to the command-line.
     *
     * @param {string} str
     * @param {boolean} verbose
     */
    copyToClipboard: function copyToClipboard(str, verbose)
    {
        const clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
        clipboardHelper.copyString(str);

        if (verbose)
            liberator.echo("Yanked " + str, commandline.FORCE_SINGLELINE);
    },

    /**
     * Converts any arbitrary string into an URI object.
     *
     * @param {string} str
     * @returns {Object}
     */
    // FIXME: newURI needed too?
    createURI: function createURI(str)
    {
        const fixup = Cc["@mozilla.org/docshell/urifixup;1"].getService(Ci.nsIURIFixup);
        return fixup.createFixupURI(str, fixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP);
    },

    /**
     * Converts HTML special characters in <b>str</b> to the equivalent HTML
     * entities.
     *
     * @param {string} str
     * @returns {string}
     */
    escapeHTML: function escapeHTML(str)
    {
        // XXX: the following code is _much_ slower than a simple .replace()
        // :history display went down from 2 to 1 second after changing
        //
        // var e = window.content.document.createElement("div");
        // e.appendChild(window.content.document.createTextNode(str));
        // return e.innerHTML;
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },

    /**
     * Escapes Regular Expression special characters in <b>str</b>.
     *
     * @param {string} str
     * @returns {string}
     */
    escapeRegex: function escapeRegex(str)
    {
        return str.replace(/([\\{}()[\].?*+])/g, "\\$1");
    },

    /**
     * Escapes quotes, newline and tab characters in <b>str</b>. The returned
     * string is delimited by <b>delimiter</b> or " if <b>delimiter</b> is not
     * specified.
     *
     * @param {string} str
     * @param {string} delimiter
     * @returns {string}
     */
    escapeString: function escapeString(str, delimiter)
    {
        if (delimiter == undefined)
            delimiter = '"';
        return delimiter + str.replace(/([\\'"])/g, "\\$1").replace("\n", "\\n", "g").replace("\t", "\\t", "g") + delimiter;
    },

    /**
     * Converts <b>bytes</b> to a pretty printed data size string.
     *
     * @param {number} bytes The number of bytes.
     * @param {string} decimalPlaces The number of decimal places to use if
     *     <b>humanReadable</b> is true.
     * @param {boolean} humanReadable Use byte multiples.
     * @returns {string}
     */
    formatBytes: function formatBytes(bytes, decimalPlaces, humanReadable)
    {
        const unitVal = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
        let unitIndex = 0;
        let tmpNum = parseInt(bytes, 10) || 0;
        let strNum = [tmpNum + ""];

        if (humanReadable)
        {
            while (tmpNum >= 1024)
            {
                tmpNum /= 1024;
                if (++unitIndex > (unitVal.length - 1))
                    break;
            }

            let decPower = Math.pow(10, decimalPlaces);
            strNum = ((Math.round(tmpNum * decPower) / decPower) + "").split(".", 2);

            if (!strNum[1])
                strNum[1] = "";

            while (strNum[1].length < decimalPlaces) // pad with "0" to the desired decimalPlaces)
                strNum[1] += "0";
        }

        for (let u = strNum[0].length - 3; u > 0; u -= 3) // make a 10000 a 10,000
            strNum[0] = strNum[0].substr(0, u) + "," + strNum[0].substr(u);

        if (unitIndex) // decimalPlaces only when > Bytes
            strNum[0] += "." + strNum[1];

        return strNum[0] + " " + unitVal[unitIndex];
    },

    /**
     * Generates an Asciidoc help entry.
     *
     * @param {Command|Mapping|Option} obj A liberator <b>Command</b>,
     *     <b>Mapping</b> or <b>Option</b> object
     * @param {string} extraHelp Extra help text beyond the description.
     * @returns {string}
     */
    generateHelp: function generateHelp(obj, extraHelp)
    {
        let start = "", end = "";
        if (obj instanceof Command)
            start = ":";
        else if (obj instanceof Option)
            start = end = "'";

        let ret = "";
        let longHelp = false;
        if ((obj.help && obj.description) && (obj.help.length + obj.description.length) > 50)
            longHelp = true;

        // the tags which are printed on the top right
        for (let j = obj.names.length - 1; j >= 0; j--)
            ret += "|" + start + obj.names[j] + end + "| ";

        if (longHelp)
            ret += "+";

        ret += "\n";

        // the usage information
        let usage = obj.names[0];
        if (obj.specs) // for :commands
            usage = obj.specs[0];

        usage = usage.replace(/{/, "\\\\{").replace(/}/, "\\\\}");
        usage = usage.replace(/'/, "\\'").replace(/`/, "\\`");
        ret += "||" + start + usage + end + "||";
        if (usage.length > 15)
            ret += " +";

        ret += "\n________________________________________________________________________________\n";

        // the actual help text
        if (obj.description)
        {
            ret += obj.description + "."; // the help description
            if (extraHelp)
                ret += " +\n" + extraHelp;
        }
        else
            ret += "Sorry, no help available";

        // add more space between entries
        ret += "\n________________________________________________________________________________\n\n\n";

        return ret;
    },

    /**
     * Sends a synchronous HTTP request to <b>url</b> and returns the
     * XMLHttpRequest object. If <b>callback</b> is specified the request is
     * asynchronous and the <b>callback</b> is invoked with the object as its
     * argument.
     *
     * @param {string} url
     * @param {function(XMLHttpRequest)} callback
     * @returns {XMLHttpRequest}
     */
    httpGet: function httpGet(url, callback)
    {
        try
        {
            let xmlhttp = new XMLHttpRequest();
            xmlhttp.mozBackgroundRequest = true;
            if (callback)
            {
                xmlhttp.onreadystatechange = function () {
                    if (xmlhttp.readyState == 4)
                        callback(xmlhttp)
                }
            }
            xmlhttp.open("GET", url, !!callback);
            xmlhttp.send(null);
            return xmlhttp;
        }
        catch (e)
        {
            liberator.log("Error opening " + url + ": " + e, 1);
        }
    },

    /**
     * The identity function.
     *
     * @param {Object} k
     * @returns {Object}
     */
    identity: function identity(k) k,

    /**
     * Returns the intersection of two rectangles.
     *
     * @param {Object} r1
     * @param {Object} r2
     * @returns {Object}
     */
    intersection: function (r1, r2) ({
        get width()  this.right - this.left,
        get height() this.bottom - this.top,
        left: Math.max(r1.left, r2.left),
        right: Math.min(r1.right, r2.right),
        top: Math.max(r1.top, r2.top),
        bottom: Math.min(r1.bottom, r2.bottom)
    }),

    /**
     * Returns the array that results from applying <b>fn</b> to each property
     * of <b>obj</b>.
     *
     * @param {Object} obj
     * @param {function} fn
     * @returns {Array}
     */
    map: function map(obj, fn)
    {
        let ary = [];
        for (let i in Iterator(obj))
            ary.push(fn(i));
        return ary;
    },

    /**
     * Converts a URI string into a URI object.
     *
     * @param {string} uri
     * @returns {nsIURI}
     */
    // FIXME: createURI needed too?
    newURI: function (uri)
    {
        return services.get("io").newURI(uri, null, null);
    },

    /**
     * Pretty print a JavaScript object. Use HTML markup to color certain items
     * if <b>color</b> is true.
     *
     * @param {Object} object The object to pretty print.
     * @param {boolean} color Whether the output should be colored.
     * @returns {string}
     */
    objectToString: function objectToString(object, color)
    {
        // Use E4X literals so html is automatically quoted
        // only when it's asked for. Noone wants to see &lt;
        // on their console or :map :foo in their buffer
        // when they expect :map <C-f> :foo.
        XML.prettyPrinting = false;
        XML.ignoreWhitespace = false;

        if (object === null)
            return "null\n";

        if (typeof object != "object")
            return false;

        try
        { // for window.JSON
            var obj = String(object);
        }
        catch (e)
        {
            obj = "[Object]";
        }
        obj = template.highlightFilter(util.clip(obj, 150), "\n", !color ? function () "^J" : function () <span highlight="NonText">^J</span>);
        let string = <><span highlight="Title Object">{obj}</span>::<br/>&#xa;</>;

        let keys = [];
        try // window.content often does not want to be queried with "var i in object"
        {
            let hasValue = !("__iterator__" in object);
            if (modules.isPrototypeOf(object))
            {
                object = Iterator(object);
                hasValue = false;
            }
            for (let i in object)
            {
                let value = <![CDATA[<no value>]]>;
                try
                {
                    value = object[i];
                }
                catch (e) {}
                if (!hasValue)
                {
                    if (i instanceof Array && i.length == 2)
                        [i, value] = i;
                    else
                        var noVal = true;
                }

                value = template.highlight(value, true, 150);
                // FIXME: Inline style.
                key = <span style="font-weight: bold;">{i}</span>;
                if (!isNaN(i))
                    i = parseInt(i);
                else if (/^[A-Z_]+$/.test(i))
                    i = "";
                keys.push([i, <>{key}{noVal ? "" : <>: {value}</>}<br/>&#xa;</>]);
            }
        }
        catch (e) {}

        function compare(a, b)
        {
            if (!isNaN(a[0]) && !isNaN(b[0]))
                return a[0] - b[0];
            return String.localeCompare(a[0], b[0]);
        }
        string += template.map(keys.sort(compare), function (f) f[1]);
        return color ? string : [s for each (s in string)].join("");
    },

    /**
     * A generator that returns the values between <b>start</b> and <b>end</b>.
     * If <b>reverse</b> is true then the values are returned in reverse order.
     *
     * @param {number} start The interval's start value.
     * @param {number} end The interval's end value.
     * @param {boolean} reverse Reverse the order in which the values are produced.
     * @returns {Iterator(Object)}
     */
    range: function range(start, end, reverse)
    {
        if (!reverse)
        {
            while (start < end)
                yield start++;
        }
        else
        {
            while (start > end)
                yield --start;
        }
    },

    /**
     * An interruptible generator that returns all values between <b>start</b>
     * and <b>end</b>. The thread yields every <b>time</b> milliseconds.
     *
     * @param {number} start The interval's start value.
     * @param {number} end The interval's end value.
     * @param {number} time The time in milliseconds between thread yields.
     * @returns {Iterator(Object)}
     */
    interruptibleRange: function interruptibleRange(start, end, time)
    {
        let endTime = Date.now() + time;
        while (start < end)
        {
            if (Date.now() > endTime)
            {
                liberator.threadYield(true, true);
                endTime = Date.now() + time;
            }
            yield start++;
        }
    },

    /**
     * Reads a string from the system clipboard.
     *
     * This is same as Firefox's readFromClipboard function, but is needed for
     * apps like Thunderbird which do not provide it.
     *
     * @returns {string}
     */
    readFromClipboard: function readFromClipboard()
    {
        let url;

        try
        {
            const clipboard = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
            const transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);

            transferable.addDataFlavor("text/unicode");

            if (clipboard.supportsSelectionClipboard())
                clipboard.getData(transferable, clipboard.kSelectionClipboard);
            else
                clipboard.getData(transferable, clipboard.kGlobalClipboard);

            let data = {};
            let dataLen = {};

            transferable.getTransferData("text/unicode", data, dataLen);

            if (data)
            {
                data = data.value.QueryInterface(Ci.nsISupportsString);
                url = data.data.substring(0, dataLen.value / 2);
            }
        }
        catch (e) {}

        return url;
    },

    /**
     * Returns an array of URLs parsed from <b>str</b>.
     *
     * Given a string like 'google bla, www.osnews.com' return an array
     * ['www.google.com/search?q=bla', 'www.osnews.com']
     *
     * @param {string} str
     * @returns {Array}
     */
    stringToURLArray: function stringToURLArray(str)
    {
        let urls = str.split(RegExp("\\s*" + options["urlseparator"] + "\\s*"));

        return urls.map(function (url) {
            try
            {
                // Try to find a matching file.
                let file = io.getFile(url);
                if (file.exists() && file.isReadable())
                    return file.path;
            }
            catch (e) {}

            // strip each 'URL' - makes things simpler later on
            url = url.replace(/^\s+|\s+$/, "");

            // Look for a valid protocol
            let proto = url.match(/^([-\w]+):/);
            if (proto && Cc["@mozilla.org/network/protocol;1?name=" + proto[1]])
                // Handle as URL, but remove spaces. Useful for copied/'p'asted URLs.
                return url.replace(/\s+/g, "");

            // Ok, not a valid proto. If it looks like URL-ish (foo.com/bar),
            // let Gecko figure it out.
            if (/[.]/.test(url) && !/\s/.test(url) || /^[\w.]+:\d+(?:\/|$)/.test(url))
                return url;

            // TODO: it would be clearer if the appropriate call to
            // getSearchURL was made based on whether or not the first word was
            // indeed an SE alias rather than seeing if getSearchURL can
            // process the call usefully and trying again if it fails - much
            // like the comments below ;-)

            // check for a search engine match in the string, then try to
            // search for the whole string in the default engine
            let searchURL = bookmarks.getSearchURL(url, false) || bookmarks.getSearchURL(url, true);
            if (searchURL)
                return searchURL;

            // Hmm. No defsearch? Let Firefox deal with it, then.
            return url;
        });
    },

    /**
     * Converts an E4X XML literal to a DOM node.
     *
     * @param {Node} node
     * @param {Document} doc
     * @param {Object} nodes If present, nodes with the "key" attribute are
     *     stored here, keyed to the value thereof.
     * @returns {Node}
     */
    xmlToDom: function xmlToDom(node, doc, nodes)
    {
        XML.prettyPrinting = false;
        switch (node.nodeKind())
        {
            case "text":
                return doc.createTextNode(node);
            case "element":
                let domnode = doc.createElementNS(node.namespace(), node.localName());
                for each (let attr in node.@*)
                    domnode.setAttributeNS(attr.name() == "highlight" ? NS.uri : attr.namespace(), attr.name(), String(attr));
                for each (let child in node.*)
                    domnode.appendChild(arguments.callee(child, doc, nodes));
                if (nodes && node.@key)
                    nodes[node.@key] = domnode;
                return domnode;
        }
    }
}; //}}}

function Struct()
{
    let self = this instanceof Struct ? this : new Struct();
    if (!arguments.length)
        return self;

    let args = Array.slice(arguments);
    self.__defineGetter__("length", function () args.length);
    self.__defineGetter__("members", function () args.slice());
    for (let arg in Iterator(args))
    {
        let [i, name] = arg;
        self.__defineGetter__(name, function () this[i]);
        self.__defineSetter__(name, function (val) { this[i] = val; });
    }
    function ConStructor()
    {
        let self = this instanceof arguments.callee ? this : new arguments.callee();
        //for (let [k, v] in Iterator(Array.slice(arguments))) // That is makes using struct twice as slow as the following code:
        for (let i = 0; i < arguments.length; i++)
        {
            if (arguments[i] != undefined)
                self[i] = arguments[i];
        }

        return self;
    }
    ConStructor.prototype = self;
    ConStructor.defaultValue = function (key, val)
    {
        let i = args.indexOf(key);
        ConStructor.prototype.__defineGetter__(i, function () (this[i] = val.call(this), this[i])); // Kludge for FF 3.0
        ConStructor.prototype.__defineSetter__(i, function (val) {
            let value = val;
            this.__defineGetter__(i, function () value);
            this.__defineSetter__(i, function (val) { value = val });
        });
    };
    return self.constructor = ConStructor;
}

Struct.prototype = {
    clone: function clone()
    {
        return this.constructor.apply(null, this.slice());
    },
    // Iterator over our named members
    __iterator__: function ()
    {
        let self = this;
        return ([v, self[v]] for ([k, v] in Iterator(self.members)))
    }
}

// Add no-sideeffect array methods. Can't set new Array() as the prototype or
// get length() won't work.
for (let [,k] in Iterator(["concat", "every", "filter", "forEach", "indexOf", "join", "lastIndexOf",
                           "map", "reduce", "reduceRight", "reverse", "slice", "some", "sort"]))
    Struct.prototype[k] = Array.prototype[k];

// vim: set fdm=marker sw=4 ts=4 et:
