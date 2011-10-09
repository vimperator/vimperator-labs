// Copyright (c) 2008 by Christian Dietrich <stettberger@dokucode.de>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const Addressbook = Module("addressbook", {
    init: function () {
        services.add("abManager", "@mozilla.org/abmanager;1", Ci.nsIAbManager);
    },

    // TODO: add option for a format specifier, like:
    // :set displayname=%l, %f
    generateDisplayName: function (firstName, lastName) {
        if (firstName && lastName)
            return lastName + ", " + firstName;
        else if (firstName)
            return firstName;
        else if (lastName)
            return lastName;
        else
            return "";
    },

    add: function (address, firstName, lastName, displayName) {
        const personalAddressbookURI = "moz-abmdbdirectory://abook.mab";
        let directory = services.get("abManager").getDirectory(personalAddressbookURI);
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
    list: function (filter, newMail) {
        let addresses = [];
        let dirs = services.get("abManager").directories;
        let lowerFilter = filter.toLowerCase();

        while (dirs.hasMoreElements()) {
            let addrbook = dirs.getNext().QueryInterface(Ci.nsIAbDirectory);
            let cards = addrbook.childCards;
            while (cards.hasMoreElements()) {
                let card = cards.getNext().QueryInterface(Ci.nsIAbCard);
                //var mail = card.primaryEmail || ""; //XXX
                let displayName = card.displayName;
                if (!displayName)
                    displayName = this.generateDisplayName(card.firstName, card.lastName);

                if (displayName.toLowerCase().indexOf(lowerFilter) > -1
                    || card.primaryEmail.toLowerCase().indexOf(lowerFilter) > -1)
                        addresses.push([displayName, card.primaryEmail]);
            }
        }

        if (addresses.length < 1) {
            if (!filter)
                liberator.echoerr("No contacts");
            else
                liberator.echoerr("No matching contacts for: " + filter);
            return false;
        }

        if (newMail) {
            // Now we have to create a new message
            let args = {};
            args.to = addresses.map(
                function (address) "\"" + address[0].replace(/"/g, "") + " <" + address[1] + ">\""
            ).join(", ");

            mail.composeNewMail(args);
        }
        else {
            let list = template.tabular(["Name", "Address"], [[util.clip(address[0], 50), address[1]] for ([, address] in Iterator(addresses))]);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        }
        return true;
    }
}, {
}, {
    commands: function () {
        commands.add(["con[tact]"],
            "Add an address book entry",
            function (args) {
                let mailAddr    = args[0]; // TODO: support more than one email address
                let firstName   = args["-firstname"] || null;
                let lastName    = args["-lastname"] || null;
                let displayName = args["-name"] || null;
                if (!displayName)
                    displayName = addressbook.generateDisplayName(firstName, lastName);

                if (addressbook.add(mailAddr, firstName, lastName, displayName))
                    liberator.echomsg("Added contact: " + displayName + " <" + mailAddr + ">");
                else
                    liberator.echoerr("Could not add contact: " + mailAddr);

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
    },
    mappings: function () {
        var myModes = config.mailModes;

        mappings.add(myModes, ["a"],
            "Open a prompt to save a new addressbook entry for the sender of the selected message",
            function () {
                try {
                    var to = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor;
                }
                catch (e) {
                    liberator.beep();
                }

                if (!to)
                    return;

                let address = to.substring(to.indexOf("<") + 1, to.indexOf(">"));

                let displayName = to.substr(0, to.indexOf("<") - 1);
                if (/^\S+\s+\S+\s*$/.test(displayName)) {
                    let names = displayName.split(/\s+/);
                    displayName = "-firstname=" + names[0].replace(/"/g, "")
                                + " -lastname=" + names[1].replace(/"/g, "");
                }
                else
                    displayName = "-name=\"" + displayName.replace(/"/g, "") + "\"";

                commandline.open("", "contact " + address + " " + displayName, modes.EX);
            });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
