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

const util = { //{{{

    Array: {
        // [["a", "b"], ["c", "d"]] -> {a: "b", c: "d"}
        // From Common Lisp, more or less
        assocToObj: function (assoc)
        {
            let obj = {};
            assoc.forEach(function ([k, v]) { obj[k] = v });
            return obj;
        },

        // flatten an array: [["foo", "bar"], ["baz"]] -> ["foo", "bar", "baz"]
        flatten: function (ary)
        {
            if (ary.length == 0)
                return [];
            return Array.concat.apply(Array, ary);
        },

        iterator: function (ary)
        {
            let length = ary.length;
            for (let i = 0; i < length; i++)
                yield ary[i];
        },

        uniq: function (ary, unsorted)
        {
            let ret = [];
            if (unsorted)
            {
                for (let [, item] in Iterator(ary))
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

    Timer: function Timer(minInterval, maxInterval, callback)
    {
        let timer = Components.classes["@mozilla.org/timer;1"]
                              .createInstance(Components.interfaces.nsITimer);
        this.doneAt = 0;
        this.latest = 0;
        this.notify = function (aTimer)
        {
            timer.cancel();
            this.latest = 0;
            /* minInterval is the time between the completion of the command and the next firing. */
            this.doneAt = Date.now() + minInterval;
            try
            {
                callback(this.arg);
            }
            finally
            {
                this.doneAt = Date.now() + minInterval;
            }
        }
        this.tell = function (arg)
        {
            if (arg !== undefined)
                this.arg = arg;

            let now = Date.now();
            if (this.doneAt == -1)
                timer.cancel();

            let timeout = minInterval;
            if (now > this.doneAt && this.doneAt > -1)
                timeout = 0;
            else if (this.latest)
                timeout = Math.min(minInterval, this.latest - now);
            else
                this.latest = now + maxInterval;
            timer.initWithCallback(this, Math.max(timeout, 0), timer.TYPE_ONE_SHOT);
            this.doneAt = -1;
        }
        this.reset = function ()
        {
            timer.cancel();
            this.doneAt = 0;
        }
        this.flush = function ()
        {
            if (this.latest)
                this.notify();
        }
    },

    ciCompare: function (a, b)
    {
        return String.localeCompare(a.toLowerCase(), b.toLowerCase());
    },

    clip: function (str, length)
    {
        return str.length <= length ? str : str.substr(0, length - 3) + "...";
    },

    computedStyle: function (node)
    {
        while (node instanceof Text && node.parentNode)
            node = node.parentNode;
        let style = node.ownerDocument.defaultView.getComputedStyle(node, null);
        return util.Array.assocToObj(Array.map(style, function (k) [k, style.getPropertyValue(k)]));
    },

    copyToClipboard: function (str, verbose)
    {
        var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                                        .getService(Components.interfaces.nsIClipboardHelper);
        clipboardHelper.copyString(str);

        if (verbose)
            liberator.echo("Yanked " + str, commandline.FORCE_SINGLELINE);
    },

    createURI: function (str)
    {
        const fixup = Components.classes["@mozilla.org/docshell/urifixup;1"]
                                .getService(Components.interfaces.nsIURIFixup);
        return fixup.createFixupURI(str, fixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP);
    },

    escapeHTML: function (str)
    {
        // XXX: the following code is _much_ slower than a simple .replace()
        // :history display went down from 2 to 1 second after changing
        //
        // var e = window.content.document.createElement("div");
        // e.appendChild(window.content.document.createTextNode(str));
        // return e.innerHTML;
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },

    escapeRegex: function (str)
    {
        return str.replace(/([\\{}()[\].?*+])/g, "\\$1");
    },

    escapeString: function (str, delimiter)
    {
        if (delimiter == undefined)
            delimiter = '"';
        return delimiter + str.replace(/([\\'"])/g, "\\$1").replace("\n", "\\n", "g").replace("\t", "\\t", "g") + delimiter;
    },

    formatBytes: function (num, decimalPlaces, humanReadable)
    {
        const unitVal = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
        var unitIndex = 0;
        var tmpNum = parseInt(num, 10) || 0;
        var strNum = [tmpNum + ""];

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
            while (strNum[1].length < decimalPlaces) // padd with "0" to the desired decimalPlaces)
                strNum[1] += "0";
        }

        for (let u = strNum[0].length - 3; u > 0; u -= 3) // make a 10000 a 10,000
            strNum[0] = strNum[0].substring(0, u)
                + "," + strNum[0].substring(u, strNum[0].length);

        if (unitIndex) // decimalPlaces only when > Bytes
            strNum[0] += "." + strNum[1];

        return strNum[0] + " " + unitVal[unitIndex];
    },

    // generates an Asciidoc help entry, "command" can also be a mapping
    generateHelp: function (command, extraHelp)
    {
        var start = "", end = "";
        if (command instanceof liberator.Command)
            start = ":";
        else if (command instanceof liberator.Option)
            start = end = "'";

        var ret = "";
        var longHelp = false;
        if ((command.help && command.description) && (command.help.length + command.description.length) > 50)
            longHelp = true;

        // the tags which are printed on the top right
        for (let j = command.names.length - 1; j >= 0; j--)
            ret += "|" + start + command.names[j] + end + "| ";

        if (longHelp)
            ret += "+";

        ret += "\n";

        // the usage information for the command
        var usage = command.names[0];
        if (command.specs) // for :commands
            usage = command.specs[0];

        usage = usage.replace(/{/, "\\\\{").replace(/}/, "\\\\}");
        usage = usage.replace(/'/, "\\'").replace(/`/, "\\`");
        ret += "||" + start + usage + end + "||";
        if (usage.length > 15)
            ret += " +";

        ret += "\n________________________________________________________________________________\n";

        // the actual help text
        if (command.description)
        {
            ret += command.description + "."; // the help description
            if (extraHelp)
                ret += " +\n" + extraHelp;
        }
        else
            ret += "Sorry, no help available";

        // add more space between entries
        ret += "\n________________________________________________________________________________\n\n\n";

        return ret;
    },

    map: function (obj, fn)
    {
        let ary = [];
        for (let i in Iterator(obj))
            ary.push(fn(i));
        return ary;
    },

    // if color = true it uses HTML markup to color certain items
    objectToString: function (object, color)
    {
        /* Use E4X literals so html is automatically quoted
         * only when it's asked for. Noone wants to see &lt;
         * on their console or :map :foo in their buffer
         * when they expect :map <C-f> :foo.
         */
        XML.prettyPrinting = false;

        if (object === null)
            return "null";

        if (typeof object != "object")
            return false;

        var string = "";
        var obj = "";
        try
        { // for window.JSON
            obj = object.toString();
        }
        catch (e)
        {
            obj = "<Object>";
        }

        if (color)
            obj = <span class="hl-Title hl-Object">{obj}</span>.toXMLString();
        string += obj + "::\n";

        let keys = [];
        try // window.content often does not want to be queried with "var i in object"
        {
            for (let i in object)
            {
                let value = "<no value>";
                try
                {
                    value = object[i];
                }
                catch (e) {}

                value = template.highlight(value, true);
                if (color)
                {
                    value = value.toXMLString();
                    i = <span style="font-weight: bold;">{i}</span>.toXMLString();
                }
                keys.push(i + ": " + value);
            }
        }
        catch (e) {}

        return string + keys.sort().join("\n") + "\n";
    },

    range: function (start, end)
    {
        while (start < end)
            yield start++;
    },

    rangeInterruptable: function (start, end, time)
    {
        let endTime = Date.now() + time;
        while (start < end)
        {
            if (Date.now() > endTime)
            {
                liberator.interrupted = false;
                liberator.threadYield();
                if (liberator.interrupted)
                    throw new Error("Interrupted");
                endTime = Date.now() + time;
            }
            yield start++;
        }
    },

    // same as Firefox's readFromClipboard function, but needed for apps like Thunderbird
    readFromClipboard: function ()
    {
        var url;
        try
        {
            var clipboard = Components.classes['@mozilla.org/widget/clipboard;1']
                                      .getService(Components.interfaces.nsIClipboard);
            var trans = Components.classes['@mozilla.org/widget/transferable;1']
                                  .createInstance(Components.interfaces.nsITransferable);
            trans.addDataFlavor("text/unicode");
            if (clipboard.supportsSelectionClipboard())
                clipboard.getData(trans, clipboard.kSelectionClipboard);
            else
                clipboard.getData(trans, clipboard.kGlobalClipboard);

            var data = {};
            var dataLen = {};
            trans.getTransferData("text/unicode", data, dataLen);
            if (data)
            {
                data = data.value.QueryInterface(Components.interfaces.nsISupportsString);
                url = data.data.substring(0, dataLen.value / 2);
            }
        }
        catch (e) {}

        return url;
    },

    // takes a string like 'google bla, www.osnews.com'
    // and returns an array ['www.google.com/search?q=bla', 'www.osnews.com']
    stringToURLArray: function (str)
    {
        var urls = str.split(new RegExp("\s*" + options["urlseparator"] + "\s*"));

        for (let url = 0; url < urls.length; url++)
        {
            try
            {
                var file = io.getFile(urls[url]);
                if (file.exists() && file.isReadable())
                {
                    urls[url] = file.path;
                    continue;
                }
            }
            catch (e) {}

            // strip each 'URL' - makes things simpler later on
            urls[url] = urls[url].replace(/^\s+/, "").replace(/\s+$/, "");

            // if the string doesn't look like a valid URL (i.e. contains a space
            // or does not contain any of: .:/) try opening it with a search engine
            // or keyword bookmark
            if (/\s/.test(urls[url]) || !/[.:\/]/.test(urls[url]))
            {
                // TODO: it would be clearer if the appropriate call to
                // getSearchURL was made based on whether or not the first word was
                // indeed an SE alias rather than seeing if getSearchURL can
                // process the call usefully and trying again if it fails - much
                // like the comments below ;-)

                // check for a search engine match in the string
                var searchURL = bookmarks.getSearchURL(urls[url], false);
                if (searchURL)
                {
                    urls[url] = searchURL;
                    continue;
                }
                else // no search engine match, search for the whole string in the default engine
                {
                    searchURL = bookmarks.getSearchURL(urls[url], true);
                    if (searchURL)
                    {
                        urls[url] = searchURL;
                        continue;
                    }
                }
            }
            // if we are here let Firefox handle the url and hope it does
            // something useful with it :)
        }

        return urls;
    },

    xmlToDom: function (node, doc)
    {
        XML.prettyPrinting = false;
        switch (node.nodeKind())
        {
            case "text":
                return doc.createTextNode(node);
            case "element":
                // Should use the node's namespace, in the future.
                let domnode = doc.createElementNS("http://www.w3.org/1999/xhtml", node.localName());
                for each (let attr in node.@*)
                    domnode.setAttribute(attr.name(), String(attr));
                for each (let child in node.*)
                    domnode.appendChild(arguments.callee(child, doc));
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
        for (let [k, v] in Iterator(Array.slice(arguments)))
            self[k] = v;
        return self;
    }
    ConStructor.prototype = self;
    return self.constructor = ConStructor;
}

Struct.prototype = {
    clone: function ()
    {
        return this.constructor.apply(null, this.slice());
    },
    // Iterator over our named members
    __iterator__: function () ([v, this[v]] for ([k, v] in this.members))
}

// Add no-sideeffect array methods. Can't set new Array() as the prototype or
// get length() won't work.
for (let [,k] in Iterator(["concat", "every", "filter", "forEach", "indexOf", "join", "lastIndexOf",
                           "map", "reduce", "reduceRight", "reverse", "slice", "some", "sort"]))
    Struct.prototype[k] = Array.prototype[k];

// vim: set fdm=marker sw=4 ts=4 et:
