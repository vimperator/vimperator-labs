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

liberator.util = { //{{{

    // TODO: use :highlight color groups
    // if "processStrings" is true, any passed strings will be surrounded by " and
    // any line breaks are displayed as \n
    colorize: function (arg, processStrings)
    {
        var type = typeof arg;

        // some objects like window.JSON or getBrowsers()._browsers need the try/catch
        try
        {
            if (type == "number")
            {
                return "<span style=\"color: red;\">" + arg + "</span>";
            }
            else if (type == "string")
            {
                if (processStrings)
                    arg = '"' + liberator.util.escapeHTML(arg.replace(/\n/, "\\n")) + '"';

                return "<span style=\"color: green;\">" + arg + "</span>";
            }
            else if (type == "boolean")
            {
                return "<span style=\"color: blue;\">" + arg + "</span>";
            }
            else if (arg == null || arg == "undefined")
            {
                return "<span style=\"color: blue;\">" + arg + "</span>";
            }
            else if (type == "object" || type == "function")
            {
                // for java packages value.toString() would crash so badly
                // that we cannot even try/catch it
                if (/^\[JavaPackage.*\]$/.test(arg))
                    return "[JavaPackage]";

                var str = arg.toString();
                if (typeof str == "string")  // can be "undefined"
                    return liberator.util.escapeHTML(str);
                else
                    return "undefined";
            }
        }
        catch (e)
        {
            return "&lt;unknown&gt;";
        }

        return "&lt;unknown type&gt;";
    },

    copyToClipboard: function (str, verbose)
    {
        var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Components.interfaces.nsIClipboardHelper);
        clipboardHelper.copyString(str);

        if (verbose)
            liberator.echo("Yanked " + str, liberator.commandline.FORCE_SINGLELINE);
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

        for (var u = strNum[0].length - 3; u > 0; u -= 3) // make a 10000 a 10,000
            strNum[0] = strNum[0].substring(0, u) + "," + strNum[0].substring(u, strNum[0].length);

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
        for (var j = command.names.length - 1; j >= 0; j--)
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

    highlightURL: function (str, force)
    {
        if (force || /^[a-zA-Z]+:\/\//.test(str))
            return "<a class='hl-URL' href='#'>" + liberator.util.escapeHTML(str) + "</a>";
        else
            return str;
    },

    // if color = true it uses HTML markup to color certain items
    objectToString: function (object, color)
    {
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
            obj = "&lt;Object&gt;";
        }

        if (color)
            string += "<span class=\"hl-Title\">" + obj + "</span>::\n";
        else
            string += obj + "::\n";

        try // window.content often does not want to be queried with "var i in object"
        {
            for (var i in object)
            {
                var value;
                try
                {
                    value = object[i];
                }
                catch (e)
                {
                    value = "&lt;no value&gt;";
                }

                if (color)
                {
                    value = this.colorize(value, true);
                    string += "<span style=\"font-weight: bold;\">" + i + "</span>: " + value + "\n";
                }
                else
                    string += i + ": " + value + "\n";
            }
        }
        catch (e) { }

        return string;
    },

    // same as Firefox's readFromClipboard function, but needed for apps like Thunderbird
    readFromClipboard: function ()
    {
        var url;
        try
        {
            var clipboard = Components.classes['@mozilla.org/widget/clipboard;1'].getService(Components.interfaces.nsIClipboard);
            var trans = Components.classes['@mozilla.org/widget/transferable;1'].createInstance(Components.interfaces.nsITransferable);
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
        catch (ex) { }

        return url;
    },

    // takes a string like 'google bla, www.osnews.com'
    // and returns an array ['www.google.com/search?q=bla', 'www.osnews.com']
    stringToURLArray: function (str)
    {
        var urls = str.split(new RegExp("\s*" + liberator.options["urlseparator"] + "\s*"));

        begin: for (var url = 0; url < urls.length; url++)
        {
            // strip each 'URL' - makes things simpler later on
            urls[url] = urls[url].replace(/^\s+/, "").replace(/\s+$/, "");

            // first check if it is an existing local file but NOT a search url/keyword
            // NOTE: the test for being a file is done first, because it's faster than getSearchURL
            var file = liberator.io.getFile(urls[url]);
            if (file.exists() && file.isReadable() && !liberator.bookmarks.getSearchURL("", urls[url]))
            {
                urls[url] = file.path;
                continue;
            }

            // if the string doesn't look like a valid URL (i.e. contains a space
            // or does not contain any of: .:/) try opening it with a search engine
            // or keyword bookmark
            if (liberator.has("bookmarks") && (/\s/.test(urls[url]) || !/[.:\/]/.test(urls[url])))
            {
                var matches = urls[url].match(/^(\S+)(?:\s+(.+))?$/);
                var alias = matches[1];
                var text = matches[2] || null;

                // TODO: it would be clearer if the appropriate call to
                // getSearchURL was made based on whether or not the first word was
                // indeed an SE alias rather than seeing if getSearchURL can
                // process the call usefully and trying again if it fails - much
                // like the comments below ;-)

                // check if the first word is a search engine
                var searchURL = liberator.bookmarks.getSearchURL(text, alias);
                if (searchURL)
                {
                    urls[url] = searchURL;
                    continue;
                }
                else // the first word was not a search engine, search for the whole string in the default engine
                {
                    searchURL = liberator.bookmarks.getSearchURL(urls[url], null);
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
    }
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
