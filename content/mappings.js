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

// Do NOT create instances of this class yourself, use the helper method
// liberator.mappings.add() instead
liberator.Map = function (modes, cmds, description, action, extraInfo) //{{{
{
    if (!modes || (!cmds || !cmds.length) || !action)
        return null;

    if (!extraInfo)
        extraInfo = {};

    this.modes = modes;
    // only store keysyms with uppercase modifier strings
    this.names = cmds.map(function (cmd) cmd.replace(/[casm]-/g, String.toUpperCase));
    this.action = action;

    this.flags = extraInfo.flags || 0;
    this.description = description || "";
    this.rhs = extraInfo.rhs || null;
    this.noremap = extraInfo.noremap || false;
};

liberator.Map.prototype = {

    hasName: function (name)
    {
        return this.names.some(function (e) e == name);
    },

    execute: function (motion, count, argument)
    {
        var args = [];

        if (this.flags & liberator.Mappings.flags.MOTION)
            args.push(motion);
        if (this.flags & liberator.Mappings.flags.COUNT)
            args.push(count);
        if (this.flags & liberator.Mappings.flags.ARGUMENT)
            args.push(argument);

        return this.action.apply(this, args);
    }

}; //}}}

liberator.Mappings = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var main = []; // default mappings
    var user = []; // user created mappings

    for (let mode in liberator.modes)
    {
        main[mode] = [];
        user[mode] = [];
    }

    function addMap(map, userMap)
    {
        var where = userMap ? user : main;
        map.modes.forEach(function (mode) { where[mode].push(map); });
    }

    function getMap(mode, cmd, stack)
    {
        var maps = stack[mode];

        for (let i = 0; i < maps.length; i++)
        {
            if (maps[i].hasName(cmd))
                return maps[i];
        }

        return null;
    }

    function removeMap(mode, cmd)
    {
        var maps = user[mode];
        var names;

        for (let i = 0; i < maps.length; i++)
        {
            names = maps[i].names;
            for (let j = 0; j < names.length; j++)
            {
                if (names[j] == cmd)
                {
                    names.splice(j, 1);

                    if (names.length == 0)
                        maps.splice(i, 1);

                    return;
                }
            }
        }
    }

    function expandLeader(keyString)
    {
        var leaderRegexp = /<Leader>/i;
        var currentLeader = liberator.mappings.getMapLeader();
        return keyString.replace(leaderRegexp, currentLeader);
    }

    function mappingsIterator(modes, stack)
    {
        var output;
        var maps = stack[modes[0]];

        for (let i = 0; i < maps.length; i++)
        {
            output = true;
            for (let index = 1; index < modes.length; index++) // check other modes
            {
                output = false; // toggle false, only true whan also found in this mode
                for (let j = 0; j < user[modes[index]].length; j++) // maps
                {
                    // NOTE: when other than user maps, there might be more than only one names[x].
                    //       since only user mappings gets queried here, only names[0] gets checked for equality.
                    if (maps[i].rhs == user[modes[index]][j].rhs && maps[i].names[0] == user[modes[index]][j].names[0])
                    {
                        output = true;
                        break; // found on this mode - check next mode, if there is one, where it could still fail...
                    }
                }
                break; // not found in this mode -> map wont' match all modes...
            }
            if (output)
                yield maps[i];
        }
    }

    function addMapCommands(ch, modes, modeDescription)
    {
        // 0 args -> list all maps
        // 1 arg  -> list the maps starting with args
        // 2 args -> map arg1 to arg*
        function map(args, mode, noremap)
        {
            if (!args)
            {
                liberator.mappings.list(mode);
                return;
            }

            // ?:\s+ <- don't remember; (...)? optional = rhs
            var [, lhs, rhs] = args.match(/(\S+)(?:\s+(.+))?/);

            if (!rhs) // list the mapping
            {
                liberator.mappings.list(mode, expandLeader(lhs));
            }
            else
            {
                for (let index = 0; index < mode.length; index++)
                {
                    liberator.mappings.addUserMap([mode[index]], [lhs],
                            "User defined mapping",
                            function (count) { liberator.events.feedkeys((count > 1 ? count : "") + rhs, noremap); },
                            {
                                flags: liberator.Mappings.flags.COUNT,
                                rhs: rhs,
                                noremap: noremap
                            });
                }
            }
        }

        var modeDescription = modeDescription ? " in " + modeDescription + " mode" : "";

        liberator.commands.add([ch ? ch + "m[ap]" : "map"],
            "Map a key sequence" + modeDescription,
            function (args) { map(args, modes, false); },
            {
                completer: function (filter)
                {
                    return liberator.completion.userMapping(filter, modes);
                }
            });

        liberator.commands.add([ch + "no[remap]"],
            "Map a key sequence without remapping keys" + modeDescription,
            function (args) { map(args, modes, true); });

        liberator.commands.add([ch + "mapc[lear]"],
            "Remove all mappings" + modeDescription,
            function ()
            {
                for (let i = 0; i < modes.length; i++)
                    liberator.mappings.removeAll(modes[i]);
            },
            { argCount: "0" });

        liberator.commands.add([ch + "unm[ap]"],
            "Remove a mapping" + modeDescription,
            function (args)
            {
                if (!args)
                {
                    liberator.echoerr("E474: Invalid argument");
                    return;
                }

                var found = false;
                for (let i = 0; i < modes.length; i++)
                {
                    if (liberator.mappings.hasMap(modes[i], args))
                    {
                        liberator.mappings.remove(modes[i], args);
                        found = true;
                    }
                }
                if (!found)
                    liberator.echoerr("E31: No such mapping");
            },
            {
                completer: function (filter)
                {
                    return liberator.completion.userMapping(filter, modes);
                }
            });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addMapCommands("",  [liberator.modes.NORMAL], "");
    addMapCommands("c", [liberator.modes.COMMAND_LINE], "command line");
    addMapCommands("i", [liberator.modes.INSERT, liberator.modes.TEXTAREA], "insert");
    if (liberator.has("mail"))
        addMapCommands("m", [liberator.modes.MESSAGE], "message");

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME:
    liberator.Mappings.flags = {
        ALLOW_EVENT_ROUTING: 1 << 0, // if set, return true inside the map command to pass the event further to firefox
        MOTION:              1 << 1,
        COUNT:               1 << 2,
        ARGUMENT:            1 << 3
    };

    return {

        // NOTE: just normal mode for now
        __iterator__: function ()
        {
            return mappingsIterator([liberator.modes.NORMAL], main);
        },

        // used by :mkvimperatorrc to save mappings
        getUserIterator: function (mode)
        {
            return mappingsIterator(mode, user);
        },

        add: function (modes, keys, description, action, extra)
        {
            addMap (new liberator.Map(modes, keys, description, action, extra), false);
        },

        addUserMap: function (modes, keys, description, action, extra)
        {
            keys = keys.map(function (key) { return expandLeader(key); });
            var map = new liberator.Map(modes, keys, description || "User defined mapping", action, extra);

            // remove all old mappings to this key sequence
            for (let i = 0; i < map.names.length; i++)
            {
                for (let j = 0; j < map.modes.length; j++)
                    removeMap(map.modes[j], map.names[i]);
            }

            addMap (map, true);
        },

        get: function (mode, cmd)
        {
            mode = mode || liberator.modes.NORMAL;
            return getMap(mode, cmd, user) || getMap(mode, cmd, main);
        },

        getDefault: function (mode, cmd)
        {
            mode = mode || liberator.modes.NORMAL;
            return getMap(mode, cmd, main);
        },

        // returns an array of mappings with names which START with "cmd" (but are NOT "cmd")
        getCandidates: function (mode, cmd)
        {
            var mappings = user[mode].concat(main[mode]);
            var matches = [];

            for (let i = 0; i < mappings.length; i++)
            {
                var map = mappings[i];
                for (let j = 0; j < map.names.length; j++)
                {
                    if (map.names[j].indexOf(cmd) == 0 && map.names[j].length > cmd.length)
                    {
                        // for < only return a candidate if it doesn't look like a <c-x> mapping
                        if (cmd != "<" || !/^<.+>/.test(map.names[j]))
                            matches.push(map);
                    }
                }
            }

            return matches;
        },

        getMapLeader: function ()
        {
            var leaderRef = liberator.variableReference("mapleader");
            return leaderRef[0] ? leaderRef[0][leaderRef[1]] : "\\";
        },

        // returns whether the user added a custom user map
        hasMap: function (mode, cmd)
        {
            return user[mode].some(function (map) { return map.hasName(cmd); });
        },

        remove: function (mode, cmd)
        {
            removeMap(mode, cmd);
        },

        removeAll: function (mode)
        {
            user[mode] = [];
        },

        list: function (modes, filter)
        {
            // modes means, a map must exist in both modes in order to get listed
            var maps = user[modes[0]]; // duplicate (reference) (first mode where it must match)
            var output = [];

            if (!maps || maps.length == 0)
            {
                liberator.echo("No mappings found");
                return;
            }

            for (let i = 0; i < maps.length; i++) // check on maps items (first mode)
            {
                output.push(true);
                if (filter && maps[i].names[0] != filter) // does it match the filter first of all?
                {
                    output[output.length - 1] = false;
                    continue;
                }
                for (let j = 1; j < modes.length; j++) // check if found in the other modes (1(2nd)-last)
                {
                    output[output.length - 1] = false; // toggle false, only true whan also found in this mode
                    for (let k = 0; k < user[modes[j]].length; k++) // maps on the other modes
                    {
                        // NOTE: when other than user maps, there might be more than only one names[x].
                        //       since only user mappings gets queried here, only names[0] gets checked for equality.
                        if (maps[i].rhs == user[modes[j]][k].rhs && maps[i].names[0] == user[modes[j]][k].names[0])
                        {
                            output[output.length - 1] = true;
                            break; // found on this mode - ok, check next mode...
                        }
                    }
                    break; // not found in this mode -> map wont' match all modes...
                }
            }

            // anything found?
            var flag = false;
            for (let i = 0; i < output.length; i++)
                if (output[i])
                    flag = true;

            if (!flag)
            {
                liberator.echo("No mappings found");
                return;
            }

            var modeSign = "";
            for (let i = 0; i < modes.length; i++)
            {
                if (modes[i] == liberator.modes.NORMAL)
                    modeSign += "n";
                if ((modes[i] == liberator.modes.INSERT || modes[i] == liberator.modes.TEXTAREA) && modeSign.indexOf("i") == -1)
                    modeSign += "i";
                if (modes[i] == liberator.modes.COMMAND_LINE)
                    modeSign += "c";
                if (modes[i] == liberator.modes.MESSAGRE)
                    modeSign += "m";
            }

            var list = "<table>";
            for (let i = 0; i < maps.length; i++)
            {
                if (!output[i])
                    continue;
                for (let j = 0; j < maps[i].names.length; j++)
                {
                    list += "<tr>";
                    list += "<td> " + modeSign + "   " + liberator.util.escapeHTML(maps[i].names[j]) + "</td>";
                    if (maps[i].rhs)
                        list += "<td> " + (maps[i].noremap ? "*" : " ") + "</td>"
                                        + "<td>" + liberator.util.escapeHTML(maps[i].rhs) + "</td>";
                    list += "</tr>";
                }
            }
            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
