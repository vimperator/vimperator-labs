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

function help(section, easter)
{
    if (easter)
    {
        echoerr("E478: Don't panic!");
        return;
    }
    if (arguments[3] && arguments[3].inTab)
        openURLsInNewTab("", true); 

    var doc = window.content.document;

    var style = "<style type='text/css'>\
table.vimperator {\
    border-width: 1px 1px 1px 1px;\
    border-spacing: 5px;\
    border-style: dotted dotted dotted dotted;\
    border-color: gray gray gray gray;\
    border-collapse: separate;\
    background-color: white;\
}\
table.vimperator th {\
    border-width: 1px 1px 1px 1px;\
    padding: 3px 3px 3px 3px;\
    border-style: hidden hidden hidden hidden;\
    border-color: gray gray gray gray;\
}\
table.vimperator td {\
    border-width: 1px 1px 1px 1px;\
    padding: 3px 3px 3px 3px;\
    border-style: hidden hidden hidden hidden;\
    border-color: gray gray gray gray;\
    background-color: rgb(250, 240, 230);\
}\
tr.tag {\
    text-align: right;\
}\
tr.tag td {\
    width: 100%;\
    padding: 3px 0px 3px 0px;\
}\
tr.tag code, td.usage code {\
    margin: 0px 2px;\
}\
td.usage code {\
    white-space: nowrap;\
}\
tr.tag code {\
    font-weight: bold;\
    font-size: 1opx;\
    margin-left: 2em;\
}\
tr.desciption {\
    margin-bottom: 4px;\
}\
table.commands td {\
    background-color: rgb(250, 240, 230);\
}\
table.commands th {\
    background-color: rgb(250, 240, 230);\
}\
table.mappings td {\
    background-color: rgb(230, 240, 250);\
}\
table.mappings th {\
    background-color: rgb(230, 240, 250);\
}\
table.settings td {\
    background-color: rgb(240, 250, 230);\
}\
table.settings th {\
    background-color: rgb(240, 250, 230);\
}\
.command { font-weight: bold; color: #632610; }\
.mapping { font-weight: bold; color: #102663; }\
.setting { font-weight: bold; color: #106326; }\
</style>";


    var header = '<h1 align=center>Vimperator</h1>' +
        '<p align=center bgcolor=blue borderwidth=1><b>First there was a Navigator, then there was an Explorer. Later it was time for a Konqueror. Now it\'s time for an Imperator, the VIMperator :)</b></p>'

    var introduction = '<h2>Introduction</h2>' +
        '<p><a href="http://vimperator.mozdev.org">Vimperator</a> is a free browser add-on for Firefox, which makes it look and behave like the <a href="http://www.vim.org">Vim</a> text editor. ' +
        'It has similar key bindings, and you could call it a modal webbrowser, as key bindings differ according to which mode you are in.</p>' +

        '<p><font color=red><b>Warning:</b></font> To provide the most authentic Vim experience, the Firefox menubar and toolbar were hidden. If you really need them, type: <code class=command>:set guioptions=mT</code> to get it back. ' +
        'If you don\'t like Vimperator at all, you can uninstall it by typing <code class=command>:addons</code> and remove/disable it. ' +
        'If you like it, but can\'t remember the shortcuts, press <code class=mapping>F1</code> or <code class=command>:help</code> to get this help window back.</p>' +

        '<p>Since Vimperator\'s GUI is embedded into a toolbar, it may look too 3D-like with the default theme. For best experience, I therefore recommend the <a href=\"https://addons.mozilla.org/firefox/364/\">Whitehart</a> theme.</p>' +

        '<p> Vimperator was written by <a href="mailto:stubenschrott@gmx.net">Martin Stubenschrott</a>. If you appreciate my work on Vimperator, you can either send me greetings, patches ' +
        'or make a donation: ' +

        '<form action="https://www.paypal.com/cgi-bin/webscr" method="post">' +
        '<input type="hidden" name="cmd" value="_s-xclick">' +
        '<input type="image" src="https://www.paypal.com/en_US/i/btn/x-click-but21.gif" border="0" name="submit" alt="Make payments with PayPal - it\'s fast, free and secure!">' +

        '<img alt="" border="0" src="https://www.paypal.com/en_US/i/scr/pixel.gif" width="1" height="1">' +
        '<input type="hidden" name="encrypted" value="-----BEGIN PKCS7-----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-----END PKCS7-----">' +
        '</form>' +

        'Of course as a believer in free open source software, only make a donation if you really like Vimperator, and the money doesn\'t hurt - otherwise just use it, recommend it and like it :)'

// xxx: for firebug: :exec Firebug.toggleBar(true)

    /* commands = array where help information is located
     * color = used for background of the table
     * beg = string which is printed before the commmand/setting/mapping name
     * end = string which is printed after the commmand/setting/mapping name
     * func = called with 'command', result is a string is prepended to the help text
     */
    function makeHelpString(commands, color, beg, end, func)
    {
        var ret = "";
        for (var i=0; i < commands.length; i++)
        {
            ret += '<tr class="tag"><td colspan="2">';
            for (var j=0; j < commands[i][COMMANDS].length; j++)
            {
                var cmd_name = commands[i][COMMANDS][j];
                cmd_name = cmd_name.replace(/</g, "&lt;");
                cmd_name = cmd_name.replace(/>/g, "&gt;");
                ret += "<code id='" + commands[i][COMMANDS][j] + "'>" +beg+ cmd_name +end+ '</code>';
            }
            ret += '</td></tr><tr class="description"><td class="usage">';
            for (var j=0; j < commands[i][USAGE].length; j++)
            {
                var usage = commands[i][USAGE][j];

                usage = usage.replace(/<(?!br\/>)/g, "&lt;");
                usage = usage.replace(/[^b][^r][^\/]>/g, "&gt;");
                ret += "<code>" +beg+ usage +end+ '</code><br/>';
            }
            ret += '</td><td>';
            if (func)
                ret += func.call(this, commands[i]);
            if (commands[i][SHORTHELP])
            {
                if(func)
                    ret += "<br/>";
                ret += "<b>";
                ret += commands[i][SHORTHELP]; // the help description
                ret += "</b><br>";
                if (commands[i][HELP])
                    ret += commands[i][HELP]; // the help description
            }
            else
                ret += "Sorry, no help available";
            ret += '</td></tr>';
        }
        return ret;
    }
    function makeSettingsHelpString(command)
    {
        var ret = "";
        ret = command[TYPE] + " (default: <code>";
        if (command[TYPE] == "boolean")
        {
            if(command[DEFAULT] == true)
                ret += "on";
            else
                ret += "off";
        }
        else
        {
            if (typeof command[DEFAULT] == 'string' && command[DEFAULT].length == 0)
                ret += "''";
            else
                ret += command[DEFAULT];
        }

        ret += "</code>)<br/>";
        return ret;
    }
        
    var mappings = '<h2>Mappings</h2>'+
        '<p>The denotion of modifier keys is like in Vim, so C- means the Control key, M- the Meta key, A- the Alt key and S- the Shift key.</p>'+
        '<p><table class="vimperator mappings">'
    mappings += makeHelpString(g_mappings, "#102663", "", "", null);
    mappings += '</table></p>';
    if (section && section == 'holy-grail')
        mappings += '<span id="holy-grail">You found it, Arthur!</span>';

    var commands = '<h2>Commands</h2><p><table class="vimperator commands">'
    commands += makeHelpString(g_commands, "#632610", ":", "", null);
    commands += '</table></p>';
    if (section && section == '42')
        commands += '<p id="42">What is the meaning of life, the universe and everything?<br/>' +
                    'Douglas Adams, the only person who knew what this question really was about is<br/>' +
                    'now dead, unfortunately.  So now you might wonder what the meaning of death<br/>' +
                    'is...</p>';

    var settings = '<h2>Settings</h2><p><table class="vimperator settings">'
    settings += makeHelpString(g_settings, "#106326", "'", "'", makeSettingsHelpString);
    settings += '</table></p>';

    var fulldoc = '<html><head><title>Vimperator help</title>' +
        style +
        '</head><body>' +
        header +
        introduction +
        mappings +
        commands +
        settings +
        '</body></html>'

    doc.open();
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
        var element = doc.getElementById(section);
        if (!element)
        {
            echoerr("E149: Sorry, no help for " + section);
            return;
        }
        var pos = cumulativeOffset(element);
        // horizontal offset is annyoing, set it to 0 (use pos[0] if you want horizontal offset)
        window.content.scrollTo(0, pos[1]);
    }
}

// vim: set fdm=marker sw=4 ts=4 et:
