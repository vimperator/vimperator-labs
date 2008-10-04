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
    Code based on venkman

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

// TODO: why are we passing around strings rather than file objects?
liberator.IO = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const WINDOWS = navigator.platform == "Win32";
    const EXTENSION_NAME = liberator.config.name.toLowerCase(); // "vimperator" or "muttator"

    var environmentService = Components.classes["@mozilla.org/process/environment;1"]
                                       .getService(Components.interfaces.nsIEnvironment);
    var directoryService = Components.classes["@mozilla.org/file/directory_service;1"]
                                     .getService(Components.interfaces.nsIProperties);

    var processDir = directoryService.get("CurWorkD", Components.interfaces.nsIFile);
    var cwd = processDir.path;
    var oldcwd = null;

    var lastRunCommand = ""; // updated whenever the users runs a command with :!
    var scriptNames = [];

    // default option values
    var cdpath = "," + (environmentService.get("CDPATH").replace(/[:;]/g, ",") || ",");
    var runtimepath = "~/" + (WINDOWS ? "" : ".") + EXTENSION_NAME;
    var shell, shellcmdflag;

    if (WINDOWS)
    {
        shell = "cmd.exe";
        // TODO: setting 'shell' to "something containing sh" updates
        // 'shellcmdflag' appropriately at startup on Windows in Vim
        shellcmdflag = "/c";
    }
    else
    {
        shell = environmentService.get("SHELL") || "sh";
        shellcmdflag = "-c";
    }

    function expandPathList(list)
    {
        return list.split(",").map(liberator.io.expandPath).join(",");
    }

    // TODO: why are we passing around so many strings? I know that the XPCOM
    // file API is limited but...
    function joinPaths(head, tail)
    {
        let pathSeparator = WINDOWS ? "\\" : "/";
        let sep = pathSeparator.replace("\\", "\\\\");

        head = head.replace(RegExp(sep + "$"), "");
        tail = tail.replace(RegExp("^" + sep), "");

        return head + pathSeparator + tail;
    }


    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.options.add(["cdpath", "cd"],
        "List of directories searched when executing :cd",
        "stringlist", cdpath,
        {
            setter: function (value) expandPathList(value)
        });

    liberator.options.add(["runtimepath", "rtp"],
        "List of directories searched for runtime files",
        "stringlist", runtimepath,
        {
            setter: function (value) expandPathList(value)
        });

    liberator.options.add(["shell", "sh"],
        "Shell to use for executing :! and :run commands",
        "string", shell,
        {
            setter: function (value) liberator.io.expandPath(value)
        });

    liberator.options.add(["shellcmdflag", "shcf"],
        "Flag passed to shell when executing :! and :run commands",
        "string", shellcmdflag);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["cd", "chd[ir]"],
        "Change the current directory",
        function (args)
        {
            if (!args)
            {
                args = "~";
            }
            else if (args == "-")
            {
                if (oldcwd)
                {
                    args = oldcwd;
                }
                else
                {
                    liberator.echoerr("E186: No previous directory");
                    return;
                }
            }

            // go directly to an absolute path or look for a relative path
            // match in 'cdpath'
            if (/^(~|\/|[a-z]:|\.\/|\.\.\/)/i.test(args))
            {
                // TODO: apparently we don't handle ../ or ./ paths yet
                if (liberator.io.setCurrentDirectory(args))
                    liberator.echo(liberator.io.getCurrentDirectory());
            }
            else
            {
                var directories = liberator.options["cdpath"].replace(/^,$|^,,|,,$/, "").split(",");

                // empty 'cdpath' items mean the current directory
                directories = directories.map(
                    function (directory) directory == "" ? liberator.io.getCurrentDirectory() : directory
                );

                var directoryFound = false;

                for (let i = 0; i < directories.length; i++)
                {
                    var dir = joinPaths(directories[i], args);
                    if (liberator.io.setCurrentDirectory(dir))
                    {
                        // FIXME: we're just overwriting the error message from
                        // setCurrentDirectory here
                        liberator.echo(liberator.io.getCurrentDirectory());
                        directoryFound = true;
                        break;
                    }
                }

                if (!directoryFound)
                {
                    liberator.echoerr("E344: Can't find directory \"" + args + "\" in cdpath"
                                    + "\n"
                                    + "E472: Command failed");
                }
            }
        },
        {
            completer: function (filter) liberator.completion.file(filter, true)
        });

    liberator.commands.add(["fini[sh]"],
        "Stop sourcing a script file",
        function ()
        {
            // this command is only used in :source
            liberator.echoerr("E168: :finish used outside of a sourced file");
        },
        { argCount: "0" });

    liberator.commands.add(["pw[d]"],
        "Print the current directory name",
        function ()
        {
            liberator.echo(liberator.io.getCurrentDirectory());
        },
        { argCount: "0" });

    // mkv[imperatorrc] or mkm[uttatorrc]
    liberator.commands.add(["mk" + EXTENSION_NAME.substr(0, 1) + "[" + EXTENSION_NAME.substr(1) + "rc]"],
        "Write current key mappings and changed options to the config file",
        function (args, special)
        {
            // TODO: "E172: Only one file name allowed"
            var filename;
            if (args)
                filename = args;
            else
                filename = "~/" + (WINDOWS ? "_" : ".") + EXTENSION_NAME + "rc";

            var file = liberator.io.getFile(filename);
            if (file.exists() && !special)
            {
                liberator.echoerr("E189: \"" + filename + "\" exists (add ! to override)");
                return;
            }

            var line = "\" " + liberator.version + "\n";
            line += "\" Mappings\n";

            var modes = [[[liberator.modes.NORMAL], ""], [[liberator.modes.COMMAND_LINE], "c"],
                         [[liberator.modes.INSERT, liberator.modes.TEXTAREA], "i"]];
            for (let i = 0; i < modes.length; i++)
            {
                // NOTE: names.length is always 1 on user maps. If that changes, also fix getUserIterator and v.m.list
                for (let map in liberator.mappings.getUserIterator(modes[i][0]))
                        line += modes[i][1] + (map.noremap ? "nore" : "") + "map " + map.names[0] + " " + map.rhs + "\n";
            }

            line += "\n\" Options\n";
            for (let option in liberator.options)
            {
                // TODO: options should be queried for this info
                // TODO: string/list options might need escaping in future
                if (!/fullscreen|usermode/.test(option.name) && option.value != option.defaultValue)
                {
                    if (option.type == "boolean")
                        line += "set " + (option.value ? option.name : "no" + option.name) + "\n";
                    else
                        line += "set " + option.name + "=" + option.value + "\n";
                }
            }

            // :mkvimrc doesn't save autocommands, so we don't either - remove this code at some point
            // line += "\n\" Auto-Commands\n";
            // for (let item in liberator.autocommands)
            //     line += "autocmd " + item + "\n";

            line += "\n\" Abbreviations\n";
            for (let abbrCmd in liberator.editor.abbreviations)
                line += abbrCmd;

            // if (liberator.mappings.getMapLeader() != "\\")
            //    line += "\nlet mapleader = \"" + liberator.mappings.getMapLeader() + "\"\n";

            // source a user .vimperatorrc file
            line += "\nsource! " + filename + ".local\n";
            line += "\n\" vim: set ft=vimperator:";

            try
            {
                liberator.io.writeFile(file, line);
            }
            catch (e)
            {
                liberator.echoerr("E190: Cannot open \"" + filename + "\" for writing");
                liberator.log("Could not write to " + file.path + ": " + e.message); // XXX
            }
        },
        {
            completer: function (filter) liberator.completion.file(filter, true)
        });

    liberator.commands.add(["ru[ntime]"],
        "Source the specified file from each directory in 'runtimepath'",
        function (args, special)
        {
            // TODO: support backslash escaped whitespace in filenames
            //     : wildcards/regexp
            //     : unify with startup sourcing loop
            let paths = args.arguments;
            let runtimeDirs = liberator.options["runtimepath"].split(",");
            let found = false;

            // FIXME: should use original arg string
            liberator.echomsg("Searching for \"" + paths.join(" ") + "\" in \"" + liberator.options["runtimepath"] + "\"", 2);

            outer:
            for (let [,runtimeDir] in Iterator(runtimeDirs))
            {
                for (let [,path] in Iterator(paths))
                {
                    let file = liberator.io.getFile(joinPaths(runtimeDir, path));

                    liberator.echomsg("Searching for \"" + file.path + "\" in \"", 3);

                    if (file.exists() && file.isReadable() && !file.isDirectory()) // XXX
                    {
                        found = true;
                        liberator.io.source(file.path, false);

                        if (!special)
                            break outer;
                    }
                }
            }

            if (!found)
                liberator.echomsg("not found in 'runtimepath': \"" + paths.join(" ") + "\"", 1); // FIXME: should use original arg string
        },
        { argCount: "+" }
    );

    liberator.commands.add(["scrip[tnames]"],
        "List all sourced script names",
        function ()
        {
            XML.prettyPrinting = false;
            var list = liberator.template.tabular(["Idx", "Filename"], ["text-align: right"], Iterator(scriptNames));
            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    liberator.commands.add(["so[urce]"],
        "Read Ex commands from a file",
        function (args, special)
        {
            // FIXME: implement proper filename quoting - "E172: Only one file name allowed"
            if (!args)
            {
                liberator.echoerr("E471: Argument required");
                return;
            }

            liberator.io.source(args, special);
        },
        {
            completer: function (filter) liberator.completion.file(filter, true)
        });

    liberator.commands.add(["!", "run"],
        "Run a command",
        function (args, special)
        {
            // :!! needs to be treated specially as the command parser sets the
            // special flag but removes the ! from args
            if (special)
                args = "!" + (args || "");

            // TODO: better escaping of ! to also substitute \\! correctly
            args = args.replace(/(^|[^\\])!/g, "$1" + lastRunCommand);
            lastRunCommand = args;

            var output = liberator.io.system(args);
            var command = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>";

            liberator.echo(command + liberator.util.escapeHTML(output));

            liberator.autocommands.trigger("ShellCmdPost", "");
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var ioManager = {

        MODE_RDONLY: 0x01,
        MODE_WRONLY: 0x02,
        MODE_RDWR: 0x04,
        MODE_CREATE: 0x08,
        MODE_APPEND: 0x10,
        MODE_TRUNCATE: 0x20,
        MODE_SYNC: 0x40,
        MODE_EXCL: 0x80,

        expandPath: function (path)
        {
            // TODO: proper pathname separator translation like Vim - this should be done elsewhere
            if (WINDOWS)
                path = path.replace("/", "\\", "g");

            // expand "~" to VIMPERATOR_HOME or HOME (USERPROFILE or HOMEDRIVE\HOMEPATH on Windows if HOME is not set)
            if (/^~/.test(path))
            {
                var home = environmentService.get("VIMPERATOR_HOME");

                if (!home)
                    home = environmentService.get("HOME");

                if (WINDOWS && !home)
                    home = environmentService.get("USERPROFILE") ||
                           environmentService.get("HOMEDRIVE") + environmentService.get("HOMEPATH");

                path = path.replace("~", home);
            }

            // expand any $ENV vars
            var envVars = path.match(/\$\w+\b/g); // this is naive but so is Vim and we like to be compatible

            if (envVars)
            {
                var expansion;

                for (let i = 0; i < envVars.length; i++)
                {
                    expansion = environmentService.get(envVars[i].replace("$", ""));
                    if (expansion)
                        path = path.replace(envVars[i], expansion);
                }
            }

            return path;
        },

        // TODO: there seems to be no way, short of a new component, to change
        // Firefox's CWD - see // https://bugzilla.mozilla.org/show_bug.cgi?id=280953
        getCurrentDirectory: function ()
        {
            let dir = ioManager.getFile(cwd);

            // NOTE: the directory could have been deleted underneath us so
            // fallback to Firefox's CWD
            if (dir.exists() && dir.isDirectory())
                return dir.path;
            else
                return processDir.path;
        },

        setCurrentDirectory: function (newdir)
        {
            newdir = newdir || "~";

            if (newdir == "-")
            {
                [cwd, oldcwd] = [oldcwd, this.getCurrentDirectory()];
            }
            else
            {
                let dir = ioManager.getFile(newdir);

                if (!dir.exists() || !dir.isDirectory())
                {
                    liberator.echoerr("E344: Can't find directory \"" + dir.path + "\" in path");
                    return null;
                }

                [cwd, oldcwd] = [dir.path, this.getCurrentDirectory()];
            }

            return ioManager.getCurrentDirectory();
        },

        getRuntimeDirectories: function (specialDirectory)
        {
            let dirs = liberator.options["runtimepath"].split(",");

            dirs = dirs.map(function (dir) liberator.io.getFile(joinPaths(dir, specialDirectory)))
                       .filter(function (dir) dir.exists() && dir.isDirectory() && dir.isReadable());

            return dirs;
        },

        getRCFile: function ()
        {
            var rcFile1 = ioManager.getFile("~/." + EXTENSION_NAME + "rc");
            var rcFile2 = ioManager.getFile("~/_" + EXTENSION_NAME + "rc");

            if (WINDOWS)
                [rcFile1, rcFile2] = [rcFile2, rcFile1];

            if (rcFile1.exists() && rcFile1.isFile())
                return rcFile1;
            else if (rcFile2.exists() && rcFile2.isFile())
                return rcFile2;
            else
                return null;
        },

        // return a nsILocalFile for path where you can call isDirectory(), etc. on
        // caller must check with .exists() if the returned file really exists
        // also expands relative paths
        getFile: function (path)
        {
            let file = Components.classes["@mozilla.org/file/local;1"]
                                 .createInstance(Components.interfaces.nsILocalFile);
            let protocolHandler = Components.classes["@mozilla.org/network/protocol;1?name=file"]
                                            .createInstance(Components.interfaces.nsIFileProtocolHandler);

            if (/file:\/\//.test(path))
            {
                file = protocolHandler.getFileFromURLSpec(path);
            }
            else
            {
                let expandedPath = ioManager.expandPath(path);

                if (!/^([a-zA-Z]:|\/)/.test(expandedPath)) // doesn't start with /, C:
                    expandedPath = joinPaths(ioManager.getCurrentDirectory(), expandedPath);

                file.initWithPath(expandedPath);
            }

            return file;
        },

        // TODO: make secure
        // returns a nsILocalFile or null if it could not be created
        createTempFile: function ()
        {
            let tmpName = EXTENSION_NAME + ".tmp";

            switch (EXTENSION_NAME)
            {
                case "muttator":
                    tmpName = "mutt-ator-mail"; // to allow vim to :set ft=mail automatically
                    break;
                case "vimperator":
                    try
                    {
                        if (window.content.document.location.hostname)
                            tmpName = EXTENSION_NAME + "-" + window.content.document.location.hostname + ".tmp";
                    }
                    catch (e) {}
                    break;
            }

            let file = directoryService.get("TmpD", Components.interfaces.nsIFile);
            file.append(tmpName);
            file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);

            if (file.exists())
                return file;
            else
                return null; // XXX

        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        readDirectory: function (file, sort)
        {
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (file.isDirectory())
            {
                var entries = file.directoryEntries;
                var array = [];
                while (entries.hasMoreElements())
                {
                    var entry = entries.getNext();
                    entry.QueryInterface(Components.interfaces.nsIFile);
                    array.push(entry);
                }
                if (sort)
                    return array.sort(function (a, b) b.isDirectory() - a.isDirectory() ||  String.localeCompare(a.path, b.path));
                return array;
            }
            else
                return []; // XXX: or should it throw an error, probably yes?
        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        // reads a file in "text" mode and returns the string
        readFile: function (file)
        {
            var ifstream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                     .createInstance(Components.interfaces.nsIFileInputStream);
            var icstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                                     .createInstance(Components.interfaces.nsIConverterInputStream);

            var charset = "UTF-8";
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            ifstream.init(file, -1, 0, 0);
            const replacementChar = Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
            icstream.init(ifstream, charset, 4096, replacementChar); // 4096 bytes buffering

            var buffer = "";
            var str = {};
            while (icstream.readString(4096, str) != 0)
                buffer += str.value;

            icstream.close();
            ifstream.close();

            return buffer;
        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        // default permission = 0644, only used when creating a new file, does not change permissions if the file exists
        // mode can be ">" or ">>" in addition to the normal MODE_* flags
        writeFile: function (file, buf, mode, perms)
        {
            var ofstream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                                     .createInstance(Components.interfaces.nsIFileOutputStream);
            var ocstream = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
                                     .createInstance(Components.interfaces.nsIConverterOutputStream);

            var charset = "UTF-8"; // Can be any character encoding name that Mozilla supports
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (mode == ">>")
                mode = ioManager.MODE_WRONLY | ioManager.MODE_CREATE | ioManager.MODE_APPEND;
            else if (!mode || mode == ">")
                mode = ioManager.MODE_WRONLY | ioManager.MODE_CREATE | ioManager.MODE_TRUNCATE;

            if (!perms)
                perms = 0644;

            ofstream.init(file, mode, perms, 0);
            ocstream.init(ofstream, charset, 0, 0x0000);
            ocstream.writeString(buf);

            ocstream.close();
            ofstream.close();
        },

        run: function (program, args, blocking)
        {
            var file = Components.classes["@mozilla.org/file/local;1"]
                                 .createInstance(Components.interfaces.nsILocalFile);

            if (!args)
                args = [];

            if (typeof blocking != "boolean")
                blocking = false;

            try
            {
                file.initWithPath(program);
            }
            catch (e)
            {
                var dirs = environmentService.get("PATH").split(WINDOWS ? ";" : ":");
lookup:
                for (let i = 0; i < dirs.length; i++)
                {
                    var path = joinPaths(dirs[i], program);
                    try
                    {
                        file.initWithPath(path);
                        if (file.exists())
                            break;

                        // TODO: couldn't we just palm this off to the start command?
                        // automatically try to add the executable path extensions on windows
                        if (WINDOWS)
                        {
                            var extensions = environmentService.get("PATHEXT").split(";");
                            for (let j = 0; j < extensions.length; j++)
                            {
                                path = joinPaths(dirs[i], program) + extensions[j];
                                file.initWithPath(path);
                                if (file.exists())
                                    break lookup;
                            }
                        }
                    }
                    catch (e) {}
                }
            }

            if (!file.exists())
            {
                liberator.echoerr("Command not found: " + program);
                return -1;
            }

            var process = Components.classes["@mozilla.org/process/util;1"]
                                    .createInstance(Components.interfaces.nsIProcess);

            process.init(file);
            process.run(blocking, args, args.length);

            return process.exitValue;
        },

        // when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is fixed
        // is fixed, should use that instead of a tmpfile
        system: function (command, input)
        {
            liberator.echomsg("Calling shell to execute: " + command, 4);

            var stdoutFile = ioManager.createTempFile();
            var stderrFile = ioManager.createTempFile();

            function escapeQuotes(str) str.replace('"', '\\"', "g");

            if (!stdoutFile || !stderrFile) // FIXME: error reporting
                return "";

            if (WINDOWS)
                command = "cd /D " + cwd + " && " + command + " > " + stdoutFile.path + " 2> " + stderrFile.path;
            else
                // TODO: should we only attempt the actual command conditionally on a successful cd?
                command = "cd " + escapeQuotes(cwd) + "; " + command + " > \"" + escapeQuotes(stdoutFile.path) + "\""
                            + " 2> \"" + escapeQuotes(stderrFile.path) + "\"";

            var stdinFile = null;

            if (input)
            {
                stdinFile = ioManager.createTempFile(); // FIXME: no returned file?
                ioManager.writeFile(stdinFile, input);
                command += " < \"" + escapeQuotes(stdinFile.path) + "\"";
            }

            var res = ioManager.run(liberator.options["shell"], [liberator.options["shellcmdflag"], command], true);

            if (res > 0)
                var output = ioManager.readFile(stderrFile) + "\nshell returned " + res;
            else
                var output = ioManager.readFile(stdoutFile);

            stdoutFile.remove(false);
            stderrFile.remove(false);

            if (stdinFile)
                stdinFile.remove(false);

            // if there is only one \n at the end, chop it off
            if (output && output.indexOf("\n") == output.length - 1)
                output = output.substr(0, output.length - 1);

            return output;
        },

        // files which end in .js are sourced as pure javascript files,
        // no need (actually forbidden) to add: js <<EOF ... EOF around those files
        source: function (filename, silent)
        {
            try
            {
                var file = ioManager.getFile(filename);

                if (!file.exists() || !file.isReadable() || file.isDirectory())
                {
                    if (!silent)
                    {
                        if (file.exists() && file.isDirectory())
                            liberator.echomsg("Cannot source a directory: \"" + filename + "\"", 0);
                        else
                            liberator.echomsg("could not source: \"" + filename + "\"", 1);

                        liberator.echoerr("E484: Can't open file " + filename);
                    }

                    return;
                }

                liberator.echomsg("sourcing \"" + filename + "\"", 2);

                let str = ioManager.readFile(file);

                // handle pure javascript files specially
                if (/\.js$/.test(filename))
                {
                    liberator.eval(str);
                }
                else
                {
                    let heredoc = "";
                    let heredocEnd = null; // the string which ends the heredoc
                    let lines = str.split("\n");

                    for (let [i, line] in Iterator(lines))
                    {
                        if (heredocEnd) // we already are in a heredoc
                        {
                            if (heredocEnd.test(line))
                            {
                                liberator.eval(heredoc);
                                heredoc = "";
                                heredocEnd = null;
                            }
                            else
                            {
                                heredoc += line + "\n";
                            }
                        }
                        else
                        {
                            // skip line comments and blank lines
                            if (/^\s*(".*)?$/.test(line))
                                continue;

                            let [count, cmd, special, args] = liberator.commands.parseCommand(line);
                            let command = liberator.commands.get(cmd);

                            if (!command)
                            {
                                let lineNumber = i + 1;

                                // FIXME: messages need to be able to specify
                                // whether they can be cleared/overwritten or
                                // should be appended to and the MOW opened
                                liberator.echoerr("Error detected while processing " + file.path,
                                    liberator.commandline.FORCE_MULTILINE);
                                liberator.commandline.echo("line " + lineNumber + ":", liberator.commandline.HL_LINENR,
                                    liberator.commandline.APPEND_TO_MESSAGES);
                                liberator.echoerr("E492: Not an editor command: " + line);
                            }
                            else
                            {
                                if (command.name == "finish")
                                {
                                    break;
                                }
                                else if (command.name == "javascript")
                                {
                                    // check for a heredoc
                                    let matches = args.match(/(.*)<<\s*(\S+)$/);

                                    if (matches)
                                    {
                                        heredocEnd = new RegExp("^" + matches[2] + "$", "m");
                                        if (matches[1])
                                            heredoc = matches[1] + "\n";
                                    }
                                    else
                                    {
                                        command.execute(args, special, count);
                                    }
                                }
                                else
                                {
                                    // execute a normal liberator command
                                    liberator.execute(line);
                                }
                            }
                        }
                    }

                    // if no heredoc-end delimiter is found before EOF then
                    // process the heredoc anyway - Vim compatible ;-)
                    liberator.eval(heredoc);
                }

                if (scriptNames.indexOf(file.path) == -1)
                    scriptNames.push(file.path);

                liberator.echomsg("finished sourcing \"" + filename + "\"", 2);

                liberator.log("Sourced: " + file.path, 3);
            }
            catch (e)
            {
                let message = "Sourcing file: " + file.path + ": " + e;
                Components.utils.reportError(message);
                if (!silent)
                    liberator.echoerr(message);
            }
        }
    }; //}}}

    return ioManager;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
