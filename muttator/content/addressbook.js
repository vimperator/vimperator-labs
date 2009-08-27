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

Copyright (c) 2008 by Christian Dietrich <stettberger@dokucode.de>

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

function Addressbook() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const abManager = Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);
    const rdf = Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService);

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

    function getDirectoryFromURI(uri) services.get("rdf").GetResource(uri).QueryInterface(Ci.nsIAbDirectory)

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{


    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.mailModes;

    mappings.add(myModes, ["a"],
        "Open a prompt to save a new addressbook entry for the sender of the selected message",
        function ()
        {
            try
            {
                var to = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor;
            }
            catch (e)
            {
                liberator.beep();
            }

            if (!to)
                return;

            let address = to.substring(to.indexOf("<") + 1, to.indexOf(">"));

            let displayName = to.substr(0, to.indexOf("<") - 1);
            if (/^\S+\s+\S+\s*$/.test(displayName))
            {
                let names = displayName.split(/\s+/);
                displayName = "-firstname=" + names[0].replace(/"/g, "")
                            + " -lastname=" + names[1].replace(/"/g, "");
            }
            else
                displayName = "-name=\"" + displayName.replace(/"/g, "") + "\"";

            commandline.open(":", "contact " + address + " " + displayName, modes.EX);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["con[tact]"],
        "Add an address book entry",
        function (args)
        {
            let mailAddr    = args[0]; // TODO: support more than one email address
            let firstName   = args["-firstname"] || null;
            let lastName    = args["-lastname"] || null;
            let displayName = args["-name"] || null;
            if (!displayName)
                displayName = generateDisplayName(firstName, lastName);

            if (addressbook.add(mailAddr, firstName, lastName, displayName))
                liberator.echomsg("Added address: " + displayName + " <" + mailAddr + ">", 1, commandline.FORCE_SINGLELINE);
            else
                liberator.echoerr("Exxx: Could not add contact `" + mailAddr + "'", commandline.FORCE_SINGLELINE);

        },
        {
            argCount: "+",
            options: [[["-firstname", "-f"], commands.OPTION_STRING],
                      [["-lastname", "-l"],  commands.OPTION_STRING],
                      [["-name", "-n"],      commands.OPTION_STRING]]
        });

    commands.add(["contacts", "addr[essbook]"],
        "List or open multiple addresses",
        function (args) { addressbook.list(args.string, args.bang); },
        { bang: true });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        add: function (address, firstName, lastName, displayName)
        {
            const personalAddressbookURI = "moz-abmdbdirectory://abook.mab";
            let directory = getDirectoryFromURI(personalAddressbookURI);
            let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);

            if (!address || !directory || !card)
                return false;

            card.primaryEmail = address;
            card.firstName = firstName;
            card.lastName = lastName;
            card.displayName = displayName;

            return directory.addCard(card);
        },

        // TODO: add telephone number support
        list: function (filter, newMail)
        {
            let addresses = [];
            let dirs = abManager.directories;
            let lowerFilter = filter.toLowerCase();

            while (dirs.hasMoreElements())
            {
                let addrbook = dirs.getNext().QueryInterface(Ci.nsIAbDirectory);
                let cards = addrbook.childCards;
                while (cards.hasMoreElements())
                {
                    let card = cards.getNext().QueryInterface(Ci.nsIAbCard);
                    //var mail = card.primaryEmail || ""; //XXX
                    let displayName = card.displayName;
                    if (!displayName)
                        displayName = generateDisplayName(card.firstName, card.lastName);

                    if (displayName.toLowerCase().indexOf(lowerFilter) > -1
                        || card.primaryEmail.toLowerCase().indexOf(lowerFilter) > -1)
                            addresses.push([displayName, card.primaryEmail]);
                }
            }

            if (addresses.length < 1)
            {
                if (!filter)
                    liberator.echoerr("Exxx: No contacts", commandline.FORCE_SINGLELINE);
                else
                    liberator.echoerr("Exxx: No contacts matching string '" + filter + "'", commandline.FORCE_SINGLELINE);
                return false;
            }

            if (newMail)
            {
                // Now we have to create a new message
                let args = {};
                args.to = addresses.map(
                    function (address) "\"" + address[0].replace(/"/g, "") + " <" + address[1] + ">\""
                ).join(", ");

                mail.composeNewMail(args);
            }
            else
            {
                let list = template.tabular(["Name", "Address"], [],
                    [[util.clip(a[0], 50), address[1]] for ([, address] in Iterator(addresses))]
                );
                commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            }
            return true;
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
