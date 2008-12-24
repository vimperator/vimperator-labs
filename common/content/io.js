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

/** @scope modules */

plugins.contexts = {};
function Script(file)
{
    let self = plugins.contexts[file.path];
    if (self)
    {
        if (self.onUnload)
            self.onUnload();
        return self;
    }
    plugins.contexts[file.path] = this;
    this.NAME = file.leafName.replace(/\..*/, "").replace(/-([a-z])/, function (_0, _1) _1.toUpperCase());
    this.PATH = file.path;
    this.__context__ = this;

    // This belongs elsewhere
    for (let [,dir] in Iterator(io.getRuntimeDirectories("plugin")))
    {
        if (dir.contains(file, false))
            plugins[name] = this.NAME;
    }
}
Script.prototype = plugins;

// TODO: why are we passing around strings rather than file objects?
/**
 * @instance io
 */
function IO() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const WINDOWS = liberator.has("Win32");
    const EXTENSION_NAME = config.name.toLowerCase(); // "vimperator" or "muttator"

    const downloadManager    = Cc["@mozilla.org/download-manager;1"].createInstance(Ci.nsIDownloadManager);

    var processDir = services.get("directory").get("CurWorkD", Ci.nsIFile);
    var cwd = processDir;
    var oldcwd = null;

    var lastRunCommand = ""; // updated whenever the users runs a command with :!
    var scriptNames = [];

    // default option values
    var cdpath = "," + (services.get("environment").get("CDPATH").replace(/[:;]/g, ",") || ",");
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
        shell = services.get("environment").get("SHELL") || "sh";
        shellcmdflag = "-c";
    }

    function expandPathList(list) list.split(",").map(io.expandPath).join(",")

    function getPathsFromPathList(list)
    {
        if (!list)
            return [];
        else
            // empty list item means the current directory
            return list.replace(/,$/, "").split(",")
                       .map(function (dir) dir == "" ? io.getCurrentDirectory().path : dir);
    }

    function replacePathSep(path) path.replace("/", IO.PATH_SEP, "g");

    function joinPaths(head, tail)
    {
        let path = ioManager.getFile(head);
        try
        {
            path.appendRelativePath(ioManager.expandPath(tail, true)); // FIXME: should only expand env vars and normalise path separators
            if (path.exists() && path.normalize)
                path.normalize();
        }
        catch (e)
        {
            return { exists: function () false, __noSuchMethod__: function () { throw e; } };
        }
        return path;
    }

    function isAbsolutePath(path)
    {
        try
        {
            services.create("file").initWithPath(path);
            return true;
        }
        catch (e)
        {
            return false;
        }
    }

    var downloadListener = {
        onDownloadStateChange: function (state, download)
        {
            if (download.state == downloadManager.DOWNLOAD_FINISHED)
            {
                let url   = download.source.spec;
                let title = download.displayName;
                let file  = download.targetFile.path;
                let size  = download.size;

                liberator.echomsg("Download of " + title + " to " + file + " finished", 1);
                autocommands.trigger("DownloadPost", { url: url, title: title, file: file, size: size });
            }
        },
        onStateChange:    function () {},
        onProgressChange: function () {},
        onSecurityChange: function () {}
    };

    downloadManager.addListener(downloadListener);
    liberator.registerObserver("shutdown", function () {
        downloadManager.removeListener(downloadListener);
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["cdpath", "cd"],
        "List of directories searched when executing :cd",
        "stringlist", cdpath,
        { setter: function (value) expandPathList(value) });

    options.add(["runtimepath", "rtp"],
        "List of directories searched for runtime files",
        "stringlist", IO.runtimePath,
        { setter: function (value) expandPathList(value) });

    options.add(["shell", "sh"],
        "Shell to use for executing :! and :run commands",
        "string", shell,
        { setter: function (value) io.expandPath(value) });

    options.add(["shellcmdflag", "shcf"],
        "Flag passed to shell when executing :! and :run commands",
        "string", shellcmdflag);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["cd", "chd[ir]"],
        "Change the current directory",
        function (args)
        {
            let arg = args.literalArg;

            if (!arg)
            {
                arg = "~";
            }
            else if (arg == "-")
            {
                if (oldcwd)
                {
                    arg = oldcwd.path;
                }
                else
                {
                    liberator.echoerr("E186: No previous directory");
                    return;
                }
            }

            arg = io.expandPath(arg);

            // go directly to an absolute path or look for a relative path
            // match in 'cdpath'
            // TODO: handle ../ and ./ paths
            if (isAbsolutePath(arg))
            {
                if (io.setCurrentDirectory(arg))
                    liberator.echomsg(io.getCurrentDirectory().path);
            }
            else
            {
                let dirs = getPathsFromPathList(options["cdpath"]);
                let found = false;

                for (let [,dir] in Iterator(dirs))
                {
                    dir = joinPaths(dir, arg);

                    if (dir.exists() && dir.isDirectory() && dir.isReadable())
                    {
                        io.setCurrentDirectory(dir.path);
                        liberator.echomsg(io.getCurrentDirectory().path);
                        found = true;
                        break;
                    }
                }

                if (!found)
                {
                    liberator.echoerr("E344: Can't find directory " + arg.quote() + " in cdpath\n"
                                    + "E472: Command failed");
                }
            }
        },
        {
            argCount: "?",
            completer: function (context) completion.directory(context, true),
            literal: 0
        });

    // NOTE: this command is only used in :source
    commands.add(["fini[sh]"],
        "Stop sourcing a script file",
        function () { liberator.echoerr("E168: :finish used outside of a sourced file"); },
        { argCount: "0" });

    commands.add(["pw[d]"],
        "Print the current directory name",
        function () { liberator.echomsg(io.getCurrentDirectory().path); },
        { argCount: "0" });

    // "mkv[imperatorrc]" or "mkm[uttatorrc]"
    commands.add([EXTENSION_NAME.replace(/(.)(.*)/, "mk$1[$2rc]")],
        "Write current key mappings and changed options to the config file",
        function (args)
        {
            // TODO: "E172: Only one file name allowed"
            let filename = args[0] || io.getRCFile(null, true).path;
            let file = io.getFile(filename);

            if (file.exists() && !args.bang)
            {
                liberator.echoerr("E189: " + filename.quote() + " exists (add ! to override)");
                return;
            }

            // TODO: Use a set/specifiable list here:
            let lines = [cmd.serial().map(commands.commandToString) for (cmd in commands) if (cmd.serial)];
            lines = util.Array.flatten(lines);

            // source a user .vimperatorrc file
            lines.unshift('"' + liberator.version);
            lines.push("\nsource! " + filename + ".local");
            lines.push("\n\" vim: set ft=vimperator:");

            try
            {
                io.writeFile(file, lines.join("\n"));
            }
            catch (e)
            {
                liberator.echoerr("E190: Cannot open " + filename.quote() + " for writing");
                liberator.log("Could not write to " + file.path + ": " + e.message); // XXX
            }
        },
        {
            argCount: "?",
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["runt[ime]"],
        "Source the specified file from each directory in 'runtimepath'",
        function (args) { io.sourceFromRuntimePath(args, args.bang); },
        {
            argCount: "+",
            bang: true
        }
    );

    commands.add(["scrip[tnames]"],
        "List all sourced script names",
        function ()
        {
            let list = template.tabular(["<SNR>", "Filename"], ["text-align: right; padding-right: 1em;"],
                ([i + 1, file] for ([i, file] in Iterator(scriptNames))));  // TODO: add colon?

            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    commands.add(["so[urce]"],
        "Read Ex commands from a file",
        function (args)
        {
            // FIXME: "E172: Only one file name allowed"
            io.source(args[0], args.bang);
        },
        {
            argCount: "1",
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["!", "run"],
        "Run a command",
        function (args)
        {
            let arg = args.literalArg;

            // :!! needs to be treated specially as the command parser sets the
            // bang flag but removes the ! from arg
            if (args.bang)
                arg = "!" + arg;

            // replaceable bang and no previous command?
            if (/((^|[^\\])(\\\\)*)!/.test(arg) && !lastRunCommand)
            {
                liberator.echoerr("E34: No previous command");
                return;
            }

            // NOTE: Vim doesn't replace ! preceded by 2 or more backslashes and documents it - desirable?
            // pass through a raw bang when escaped or substitute the last command
            arg = arg.replace(/(\\)*!/g,
                function (m) /^\\(\\\\)*!$/.test(m) ? m.replace("\\!", "!") : m.replace("!", lastRunCommand)
            );

            lastRunCommand = arg;

            let output = io.system(arg);

            commandline.echo(template.commandOutput(<span highlight="CmdOutput">{output}</span>));

            autocommands.trigger("ShellCmdPost", {});
        },
        {
            argCount: "?", // TODO: "1" - probably not worth supporting weird Vim edge cases. The dream is dead. --djk
            bang: true,
            completer: function (context) completion.shellCommand(context),
            literal: 0
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function ()
    {
        completion.setFunctionCompleter([ioManager.getFile, ioManager.expandPath],
            [function (context, obj, args) {
                context.quote[2] = "";
                completion.file(context, true);
            }]);
    });

    var ioManager = {

        MODE_RDONLY: 0x01,
        MODE_WRONLY: 0x02,
        MODE_RDWR: 0x04,
        MODE_CREATE: 0x08,
        MODE_APPEND: 0x10,
        MODE_TRUNCATE: 0x20,
        MODE_SYNC: 0x40,
        MODE_EXCL: 0x80,

        sourcing: null,

        expandPath: IO.expandPath,

        // TODO: there seems to be no way, short of a new component, to change
        // Firefox's CWD - see // https://bugzilla.mozilla.org/show_bug.cgi?id=280953
        getCurrentDirectory: function ()
        {
            let dir = ioManager.getFile(cwd.path);

            // NOTE: the directory could have been deleted underneath us so
            // fallback to Firefox's CWD
            if (dir.exists() && dir.isDirectory())
                return dir;
            else
                return processDir;
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
                    liberator.echoerr("E344: Can't find directory " + dir.path.quote() + " in path");
                    return null;
                }

                [cwd, oldcwd] = [dir, this.getCurrentDirectory()];
            }

            return ioManager.getCurrentDirectory();
        },

        getRuntimeDirectories: function (specialDirectory)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);

            dirs = dirs.map(function (dir) joinPaths(dir, specialDirectory))
                       .filter(function (dir) dir.exists() && dir.isDirectory() && dir.isReadable());

            return dirs;
        },

        getRCFile: function (dir, always)
        {
            dir = dir || "~";

            let rcFile1 = joinPaths(dir, "." + EXTENSION_NAME + "rc");
            let rcFile2 = joinPaths(dir, "_" + EXTENSION_NAME + "rc");

            if (WINDOWS)
                [rcFile1, rcFile2] = [rcFile2, rcFile1];

            if (rcFile1.exists() && rcFile1.isFile())
                return rcFile1;
            else if (rcFile2.exists() && rcFile2.isFile())
                return rcFile2;
            else if (always)
                return rcFile1;
            return null;
        },

        // return a nsILocalFile for path where you can call isDirectory(), etc. on
        // caller must check with .exists() if the returned file really exists
        // also expands relative paths
        getFile: function (path, noCheckPWD)
        {
            let file = services.create("file");

            if (/file:\/\//.test(path))
            {
                file = Cc["@mozilla.org/network/protocol;1?name=file"].createInstance(Ci.nsIFileProtocolHandler)
                                 .getFileFromURLSpec(path);
            }
            else
            {
                let expandedPath = ioManager.expandPath(path);

                if (!isAbsolutePath(expandedPath) && !noCheckPWD)
                    file = joinPaths(ioManager.getCurrentDirectory().path, expandedPath);
                else
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

            let file = services.get("directory").get("TmpD", Ci.nsIFile);
            file.append(tmpName);
            file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

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
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (file.isDirectory())
            {
                let entries = file.directoryEntries;
                let array = [];
                while (entries.hasMoreElements())
                {
                    let entry = entries.getNext();
                    array.push(entry.QueryInterface(Ci.nsIFile));
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
            let ifstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
            let icstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);

            let toCharset = "UTF-8";
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            ifstream.init(file, -1, 0, 0);
            icstream.init(ifstream, toCharset, 4096, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER); // 4096 bytes buffering

            let buffer = "";
            let str = {};
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
            let ofstream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
            let ocstream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);

            let charset = "UTF-8"; // Can be any character encoding name that Mozilla supports
            if (typeof file == "string")
                file = ioManager.getFile(file);
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

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
            args = args || [];
            blocking = !!blocking;

            let file;

            if (isAbsolutePath(program))
            {
                file = ioManager.getFile(program, true);
            }
            else
            {
                let dirs = services.get("environment").get("PATH").split(WINDOWS ? ";" : ":");
                // Windows tries the cwd first TODO: desirable?
                if (WINDOWS)
                    dirs = [io.getCurrentDirectory().path].concat(dirs);

lookup:
                for (let [,dir] in Iterator(dirs))
                {
                    file = joinPaths(dir, program);
                    try
                    {
                        if (file.exists())
                            break;

                        // TODO: couldn't we just palm this off to the start command?
                        // automatically try to add the executable path extensions on windows
                        if (WINDOWS)
                        {
                            let extensions = services.get("environment").get("PATHEXT").split(";");
                            for (let [,extension] in Iterator(extensions))
                            {
                                file = joinPaths(dir, program + extension);
                                if (file.exists())
                                    break lookup;
                            }
                        }
                    }
                    catch (e) {}
                }
            }

            if (!file || !file.exists())
            {
                liberator.echoerr("Command not found: " + program);
                return -1;
            }

            let process = services.create("process");

            process.init(file);
            process.run(blocking, args, args.length);

            return process.exitValue;
        },

        // when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is fixed
        // is fixed, should use that instead of a tmpfile
        system: function (command, input)
        {
            liberator.echomsg("Calling shell to execute: " + command, 4);

            function escape(str) '"' + str.replace(/[\\"$]/g, "\\$&") + '"';

            return this.withTempFiles(function (stdin, stdout, stderr, cmd) {

                if (input)
                    this.writeFile(stdin, input);

                if (WINDOWS)
                {
                    command = "cd /D " + cwd.path + " && " + command + " > " + stdout.path + " 2> " + stderr.path + " < " + stdin.path;
                    var res = this.run(options["shell"], options["shellcmdflag"].split(/\s+/).concat(command), true);
                }
                else
                {

                    this.writeFile(cmd, "cd " + escape(cwd.path) + "\n" +
                            ["exec", ">" + escape(stdout.path), "2>" + escape(stderr.path), "<" + escape(stdin.path),
                             escape(options["shell"]), options["shellcmdflag"], escape(command)].join(" "));
                    res = this.run("/bin/sh", ["-e", cmd.path], true);
                }

                if (res > 0) // FIXME: Is this really right? Shouldn't we always show both?
                    var output = ioManager.readFile(stderr) + "\nshell returned " + res;
                else
                    output = ioManager.readFile(stdout);

                // if there is only one \n at the end, chop it off
                if (output && output.indexOf("\n") == output.length - 1)
                    output = output.substr(0, output.length - 1);

                return output;
            }) || "";
        },

        // FIXME: multiple paths?
        sourceFromRuntimePath: function (paths, all)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);
            let found = false;

            // FIXME: should use original arg string
            liberator.echomsg("Searching for " + paths.join(" ").quote() + " in " + options["runtimepath"].quote(), 2);

            outer:
            for (let [,dir] in Iterator(dirs))
            {
                for (let [,path] in Iterator(paths))
                {
                    let file = joinPaths(dir, path);

                    liberator.echomsg("Searching for " + file.path.quote(), 3);

                    if (file.exists() && file.isFile() && file.isReadable())
                    {
                        io.source(file.path, false);
                        found = true;

                        if (!all)
                            break outer;
                    }
                }
            }

            if (!found)
                liberator.echomsg("not found in 'runtimepath': " + paths.join(" ").quote(), 1); // FIXME: should use original arg string

            return found;
        },

        // files which end in .js are sourced as pure javascript files,
        // no need (actually forbidden) to add: js <<EOF ... EOF around those files
        source: function (filename, silent)
        {
            let wasSourcing = ioManager.sourcing;
            try
            {
                var file = ioManager.getFile(filename);
                ioManager.sourcing = {
                    file: file.path,
                    line: 0
                };

                if (!file.exists() || !file.isReadable() || file.isDirectory())
                {
                    if (!silent)
                    {
                        if (file.exists() && file.isDirectory())
                            liberator.echomsg("Cannot source a directory: " + filename.quote(), 0);
                        else
                            liberator.echomsg("could not source: " + filename.quote(), 1);

                        liberator.echoerr("E484: Can't open file " + filename);
                    }

                    return;
                }

                liberator.echomsg("sourcing " + filename.quote(), 2);

                let str = ioManager.readFile(file);
                let uri = ioService.newFileURI(file);

                // handle pure javascript files specially
                if (/\.js$/.test(filename))
                {
                    try
                    {
                        liberator.loadScript(uri.spec, new Script(file));
                    }
                    catch (e)
                    {
                        let err = new Error();
                        for (let [k, v] in Iterator(e))
                            err[k] = v;
                        err.echoerr = file.path + ":" + e.lineNumber + ": " + e;
                        throw err;
                    }
                }
                else if (/\.css$/.test(filename))
                {
                    storage.styles.registerSheet(uri.spec, true);
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
                                command.execute(heredoc, special, count);
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
                            ioManager.sourcing.line = i + 1;
                            // skip line comments and blank lines
                            line = line.replace(/\r$/, "");

                            if (/^\s*(".*)?$/.test(line))
                                continue;

                            var [count, cmd, special, args] = commands.parseCommand(line);
                            var command = commands.get(cmd);

                            if (!command)
                            {
                                let lineNumber = i + 1;

                                // FIXME: messages need to be able to specify
                                // whether they can be cleared/overwritten or
                                // should be appended to and the MOW opened
                                liberator.echoerr("Error detected while processing " + file.path, commandline.FORCE_MULTILINE);
                                commandline.echo("line " + lineNumber + ":", commandline.HL_LINENR, commandline.APPEND_TO_MESSAGES);
                                liberator.echoerr("E492: Not an editor command: " + line);
                            }
                            else
                            {
                                if (command.name == "finish")
                                {
                                    break;
                                }
                                else if (command.hereDoc)
                                {
                                    // check for a heredoc
                                    let matches = args.match(/(.*)<<\s*(\S+)$/);

                                    if (matches)
                                    {
                                        args = matches[1];
                                        heredocEnd = RegExp("^" + matches[2] + "$", "m");
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
                                    liberator.execute(line, null, true);
                                }
                            }
                        }
                    }

                    // if no heredoc-end delimiter is found before EOF then
                    // process the heredoc anyway - Vim compatible ;-)
                    if (heredocEnd)
                        command.execute(heredoc, special, count);
                }

                if (scriptNames.indexOf(file.path) == -1)
                    scriptNames.push(file.path);

                liberator.echomsg("finished sourcing " + filename.quote(), 2);

                liberator.log("Sourced: " + filename, 3);
            }
            catch (e)
            {
                let message = "Sourcing file: " + (e.echoerr || file.path + ": " + e);
                liberator.reportError(e);
                if (!silent)
                    liberator.echoerr(message);
            }
            finally
            {
                ioManager.sourcing = wasSourcing;
            }
        },

        withTempFiles: function (fn, self)
        {
            let args = util.map(util.range(0, fn.length), this.createTempFile);
            if (!args.every(util.identity))
                return false;
            try
            {
                return fn.apply(self || this, args);
            }
            finally
            {
                args.forEach(function (f) f.remove(false));
            }
        }
    }; //}}}

    return ioManager;

}; //}}}

IO.PATH_SEP = (function () {
    let file = services.create("file");
    file.append("foo");
    return file.path[0];
})();

IO.__defineGetter__("runtimePath", function () services.get("environment").get(config.name.toUpperCase() + "_RUNTIME") ||
        "~/" + (liberator.has("Win32") ? "" : ".") + config.name.toLowerCase());

IO.expandPath = function (path, relative)
{
    // TODO: proper pathname separator translation like Vim - this should be done elsewhere
    const WINDOWS = liberator.has("Win32");

    // expand any $ENV vars - this is naive but so is Vim and we like to be compatible
    // TODO: Vim does not expand variables set to an empty string (and documents it).
    // Kris reckons we shouldn't replicate this 'bug'. --djk
    // TODO: should we be doing this for all paths?
    function expand(path) path.replace(
        !WINDOWS ? /\$(\w+)\b|\${(\w+)}/g
                 : /\$(\w+)\b|\${(\w+)}|%(\w+)%/g,
        function (m, n1, n2, n3) services.get("environment").get(n1 || n2 || n3) || m
    );
    path = expand(path);

    // expand ~
    if (!relative && (WINDOWS ? /^~(?:$|[\\\/])/ : /^~(?:$|\/)/).test(path))
    {
        // Try $HOME first, on all systems
        let home = services.get("environment").get("HOME");

        // Windows has its own ideosyncratic $HOME variables.
        if (!home && WINDOWS)
            home = services.get("environment").get("USERPROFILE") ||
                   services.get("environment").get("HOMEDRIVE") + services.get("environment").get("HOMEPATH");

        path = home + path.substr(1);
    }

    // TODO: Vim expands paths twice, once before checking for ~, once
    // after, but doesn't document it. Is this just a bug? --Kris
    path = expand(path);
    return path.replace("/", IO.PATH_SEP, "g");
};

// vim: set fdm=marker sw=4 ts=4 et:
