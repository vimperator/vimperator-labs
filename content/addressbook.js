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

(c) 2008: Christian Dietrich <stettberger@dokucode.de>

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

liberator.Addressbook = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const abManager = Components.classes["@mozilla.org/abmanager;1"]
                       .getService(Components.interfaces.nsIAbManager);
    const rdf = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                       .getService(Components.interfaces.nsIRDFService);

    const kPersonalAddressbookURI = "moz-abmdbdirectory://abook.mab";

    function load()
    {
    }

    // TODO: add option for a format specifier, like:
    // :set displayname=%l, %f
    function generateDisplayName(firstName, lastName)
    {
        if (firstName && lastName)
            return lastName + ", " + firstName;
        else if (firstName)
            return firstName;
        else if (lastName)
            return lastName;
        else
            return "";
    }

    function getDirectoryFromURI(uri)
    {
       return rdf.GetResource(uri).QueryInterface(Components.interfaces.nsIAbDirectory);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{


    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = liberator.config.mailModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes, ["a"],
        "Open a prompt to save a new addressbook entry for the sender of the selected message",
        function ()
        {
            var to;
            try
            {
                to = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor;
            }
            catch (e) { liberator.beep(); }

            if (!to)
                return;

            var address = to.substring(to.indexOf("<") + 1, to.indexOf(">"));

            var displayName = to.substr(0, to.indexOf("<") - 1);
            if (/^\S+\s+\S+\s*$/.test(displayName))
            {
                var names = displayName.split(/\s+/);
                displayName = "-firstname=" + names[0].replace(/"/g, "")
                            + " -lastname=" + names[1].replace(/"/g, "");
            }
            else
            {
                displayName = "-name=\"" + displayName.replace(/"/g, "") + "\"";
            }

            liberator.commandline.open(":", "contact " + address + " " + displayName, liberator.modes.EX);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["con[tact]"],
        "Add an address book entry",
        function (args)
        {
            var mailAddr =    args.arguments[0]; // TODO: support more than one email address
            var firstName =   args["-firstname"] || null;
            var lastName =    args["-lastname"] || null;
            var displayName = args["-name"] || null;
            if (!displayName)
                displayName = generateDisplayName(firstName, lastName);

            if (liberator.addressbook.add(mailAddr, firstName, lastName, displayName))
                liberator.echo("Added address: " + displayName + " <" + mailAddr + ">", liberator.commandline.FORCE_SINGLELINE);
            else
                liberator.echoerr("Exxx: Could not add bookmark `" + mailAddr + "'", liberator.commandline.FORCE_SINGLELINE);

        },
        {
            options: [[["-firstname", "-f"], liberator.commands.OPTION_STRING],
                      [["-lastname", "-l"],  liberator.commands.OPTION_STRING],
                      [["-name", "-n"],      liberator.commands.OPTION_STRING]],
            argCount: "+"
        });

    liberator.commands.add(["contacts", "addr[essbook]"],
        "List or open multiple addresses",
        function (args, special) { liberator.addressbook.list(args, special); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

		add: function (address, firstname, lastname, displayName)
		{
			var directory = getDirectoryFromURI(kPersonalAddressbookURI);
			var card = Components.classes["@mozilla.org/addressbook/cardproperty;1"]
					   .createInstance(Components.interfaces.nsIAbCard);

			if (!address || !directory || !card)
				return false;

			card.primaryEmail = address;
			card.firstName = firstname;
			card.lastName = lastname;
			card.displayName = displayName;

			return directory.addCard(card);
		},

        // TODO: add telephone number support
		list: function (filter, newMail)
		{
            var addresses = [];
            var dirs = abManager.directories;
            var lowerFilter = filter.toLowerCase();

            while (dirs.hasMoreElements())
            {
                var addrbook = dirs.getNext().QueryInterface(Components.interfaces.nsIAbDirectory);
                var cards = addrbook.childCards;
                while (cards.hasMoreElements())
                {
                    var card = cards.getNext().QueryInterface(Components.interfaces.nsIAbCard);
                    var mail = card.primaryEmail || "";
                    var displayName = card.displayName;
                    if (!displayName)
                        displayName = generateDisplayName(card.firstName, card.lastName);

                    if (displayName.toLowerCase().indexOf(lowerFilter) > -1
                        || card.primaryEmail.toLowerCase().indexOf(lowerFilter) > -1)
                            addresses.push([displayName, card.primaryEmail]);
                }
            }
            if (addresses.length < 1)
            {
                liberator.echoerr("E94: No matching contact for " + filter, liberator.commandline.FORCE_SINGLELINE);
                return false;
            }

			if (newMail)
			{
				// Now we have to create a new message
				var args = new Object();
				args.to = addresses.map(function (address)
				{
					return "\"" + address[0].replace(/"/g, "") + " <" + address[1] + ">\"";
				}).join(", ");

				liberator.mail.composeNewMail(args);
			}
			else
			{
				var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
						   "<table><tr align=\"left\" class=\"hl-Title\"><th>Name</th><th>Address</th></tr>";
				for (var i = 0; i < addresses.length; i++)
				{
                    var displayName = liberator.util.escapeHTML(addresses[i][0]);
                    if (displayName.length > 50)
                        displayName = displayName.substr(0, 47) + "...";
                    var mailAddr = liberator.util.escapeHTML(addresses[i][1]);
                    list += "<tr><td>" + displayName + "</td><td style=\"width: 100%\"><a href=\"#\" class=\"hl-URL\">" + mailAddr + "</a></td></tr>";
                }
                list += "</table>";

                liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
            }
            return true;
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
