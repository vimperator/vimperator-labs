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

(c) 2006-2007: Martin Stubenschrott <stubenschrott@gmx.net>

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

Vimperator.prototype.help = function(section, easter) //{{{
{
    if (easter)
    {
        vimperator.echoerr("E478: Don't panic!");
        return;
    }
    if ((arguments[3] && arguments[3].inTab))// || !window.content.document.open)
        openURLsInNewTab("", true);
    else
        openURLs("about:blank");

    /* commands = array where help information is located
     * beg = string which is printed before the commmand/option/mapping name
     * end = string which is printed after the commmand/option/mapping name
     * func = called with 'command', result is a string is prepended to the help text
     */
    function makeHelpString(commands, beg, end, func)
    {
        var ret = "";
        for (var command in commands)
        {
            // the usage information for the command
            ret += '<tr class="description"><td class="usage" valign="top">';
            for (var j=0; j < command.usage.length; j++)
            {
                var usage = command.usage[j];

                // keep <br/>
                //usage = usage.replace(/<([^b][^r].*>)/g, "&lt;$1");
                //usage = usage.replace(/[^b][^r][^\/]>/g, "&gt;");
                usage = usage.replace(/</g, "&lt;");
                usage = usage.replace(/>/g, "&gt;");
                usage = usage.replace(/\\n/g, "<br/>");
                // color {count} and [url] arguments in the usage, not nice and error prone but the regexp work (for now)
                usage = usage.replace(/(^|;|\n|\s|\]|\}|=|<br\/?>)({.*?}|\[.*?\])/gm, "$1<span class=\"argument\">$2</span>");
                // and the 'option' in a different color
                usage = usage.replace(/^'(\w+)'/gm, "'<span class=\"option\">$1</span>'");
                ret += "<code>" +beg+ usage +end+ '</code><br/>';
            }
            ret += '</td><td valign="top">';

            // the actual help text with the first line in bold
            if (command.short_help)
            {
                ret += '<span class="shorthelp">';
                ret += command.short_help; // the help description
                ret += "</span><br/>";
                if(func) // for options we print default values here, e.g.
                {
                    ret += func.call(this, command);
                    ret += "<br/>";
                }
                if (command.help)
                {
                    ret += command.help; // the help description
                    ret += "<br/>";
                }
            }
            else
                ret += "Sorry, no help available";
            // the tags which are printed on the top right
            ret += '</td><td class="taglist" valign="top">';
            var names = command.names;
            for (var j=0; j < names.length; j++)
            {
                var cmd_name = names[j];
                cmd_name = cmd_name.replace(/</g, "&lt;");
                cmd_name = cmd_name.replace(/>/g, "&gt;");
                // cmd_name = cmd_name.replace(/"/g, "&quot;");
                // cmd_name = cmd_name.replace(/'/g, "&apos;");
                // cmd_name = cmd_name.replace(/&/g, "&amp;");
                ret += '<code class="tag">' + beg + cmd_name + end + '</code><br/>';
            }
            ret += '</td></tr>';

            // add more space between entries
            // FIXME: if (i < commands.length-1)
                ret += '<tr class="separator"><td colspan="3"><hr/></td></tr>\n';
        }
        return ret;
    }
    function makeOptionsHelpString(command)
    {
        var ret = "";
        ret = command.type + ' (default: ';
        if (command.type == "boolean")
        {
            if(command.default_value == true)
                ret += "on";
            else
                ret += "off";
        }
        else
        {
            if (typeof command.default_value == 'string' && command.default_value.length == 0)
                ret += "''";
            else
                ret += command.default_value;
        }

        ret += ")<br/>";
        return ret;
    }

    var header = '<h1>Vimperator</h1>\n' +
        '<p class="tagline">First there was a Navigator, then there was an Explorer.\n' +
        'Later it was time for a Konqueror. Now it\'s time for an Imperator, the VIMperator :)</p>\n';

    var introduction = '<span style="float: right"><code class="tag">introduction</code></span><h2 id="introduction">Introduction</h2>' +
        '<p><a href="http://vimperator.mozdev.org">Vimperator</a> is a free browser add-on for Firefox, which makes it look and behave like the <a href="http://www.vim.org">Vim</a> text editor. ' +
        'It has similar key bindings, and you could call it a modal web browser, as key bindings differ according to which mode you are in.</p>\n' +

        '<p><span class="warning">Warning:</span> To provide the most authentic Vim experience, the Firefox menubar and toolbar were hidden.<br/>' +
        'If you really need them, type: <code class="command">:set guioptions=mT</code> to get it back.\n' +
        'If you don\'t like Vimperator at all, you can uninstall it by typing <code class="command">:addons</code> and remove/disable it.' +
        'If you like it, but can\'t remember the shortcuts, press <code class="mapping">F1</code> or <code class="command">:help</code> to get this help window back.</p>\n' +

        '<p>Since Vimperator\'s GUI is embedded into a toolbar, it may look too 3D-like with the default theme. ' +
        'For best experience, I therefore recommend the <a href="https://addons.mozilla.org/firefox/364/">Whitehart</a> theme.</p>\n' +

        '<p>Vimperator was written by <a href="mailto:stubenschrott@gmx.net">Martin Stubenschrott</a>. If you appreciate my work on Vimperator, you can either send me greetings, patches or make a donation: </p>\n' +

        '<form action="https://www.paypal.com/cgi-bin/webscr" method="post">\n<fieldset class="paypal">' +
        '<input type="hidden" name="cmd" value="_s-xclick"/>' +
        '<input type="image" src="https://www.paypal.com/en_US/i/btn/x-click-but21.gif" name="submit" alt="Make payments with PayPal - it\'s fast, free and secure!"/>' +

        '<img alt="" src="https://www.paypal.com/en_US/i/scr/pixel.gif" width="1" height="1"/>' +
        '<input type="hidden" name="encrypted" value="-----BEGIN PKCS7-----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-----END PKCS7-----"/>' +
        '</fieldset>\n</form>\n' +

        '<p>Of course as a believer in free open source software, only make a donation if you really like Vimperator, and the money doesn\'t hurt - otherwise just use it, recommend it and like it :)</p>\n'

    var mappings = '<span style="float: right"><code class="tag">mappings</code></span><h2 id="mappings">Mappings</h2>\n' +
        '<p>The denotion of modifier keys is like in Vim, so C- means the Control key, M- the Meta key, A- the Alt key and S- the Shift key.</p>'+
        '<table class="vimperator mappings">'
    mappings += makeHelpString(vimperator.mappings, "", "", null);
    mappings += '</table>';
    if (section && section == 'holy-grail')
        mappings += '<span id="holy-grail">You found it, Arthur!</span>\n';

    var commands = '<span style="float: right"><code class="tag">commands</code></span><h2 id="commands">Commands</h2>\n' +
        '<table class="vimperator commands">\n';
    commands += makeHelpString(vimperator.commands, ":", "", null);
    commands += '</table>';
    if (section && section == '42')
        commands += '<p id="42">What is the meaning of life, the universe and everything?<br/>' +
                    'Douglas Adams, the only person who knew what this question really was about is<br/>' +
                    'now dead, unfortunately.  So now you might wonder what the meaning of death<br/>' +
                    'is...</p>\n';

    var options = '<span style="float: right"><code class="tag">options</code></span><h2 id="options">Options</h2>\n' +
        '<table class="vimperator options">\n';
    options += makeHelpString(vimperator.options, "'", "'", makeOptionsHelpString);
    options += '</table>';

    var fulldoc = '<?xml version="1.0"?>\n' +
        '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"\n  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">\n<head>\n<title>Vimperator help</title>\n' +
        // XXX: stylesheet broken here? Have to add it in the vimperator.xul file
        '<link rel="stylesheet" href="chrome://vimperator/content/default.css" type="text/css"/>\n' +
        '</head>\n<body>\n<div class="main">\n' +
        '<span class="version">version ' + vimperator.version + '</span>\n' +
        header +
        introduction +
        mappings +
        commands +
        options +
        '\n</div>\n</body>\n</html>';

    var doc = window.content.document;

    try
    {
        doc.open();
    }
    catch(e)
    {
        // when the url is "about:" or any other xhtml page the doc is not open
        // then retry again in 250ms but just once
        if (arguments[3] && arguments[3].recursive)
            return false;

        openURLs("about:blank");
        setTimeout(function () { vimperator.help(section, false, null, {recursive: true}); }, 250);
        return;
    }
    doc.write(fulldoc);
    doc.close();


    function cumulativeOffset(element)
    {
        var valueT = 0, valueL = 0;
        if (!element)
            return [0, 0];

        do
        {
            valueT += element.offsetTop  || 0;
            valueL += element.offsetLeft || 0;
            element = element.offsetParent;
        }
        while (element);

        return [valueL, valueT];
    }

    if (section)
    {
        function findSectionElement(section)
        {
            return evaluateXPath('//code[@class="tag" and text()="' + section + '"]')
                .snapshotItem(0);
        }

        var element = findSectionElement(section);
        if (!element)
        {
            var firstChar = section.charAt(0);
            if (firstChar != ':' && firstChar != "'")
            {
                element = findSectionElement(':' + section);
                if (!element)
                    element = findSectionElement("'" + section + "'");
            }
        }
        if (!element)
        {
            vimperator.echoerr("E149: Sorry, no help for " + section);
            return;
        }
        // FIXME: H2 elements are currently wrapped in DIVs so this works
        var pos = cumulativeOffset(element.parentNode);
        // horizontal offset is annoying, set it to 0 (use pos[0] if you want horizontal offset)
        window.content.scrollTo(0, pos[1]);
    }
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
