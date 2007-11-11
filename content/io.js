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

vimperator.IO = function ()
{
    var environment_service = Components.classes["@mozilla.org/process/environment;1"]
        .getService(Components.interfaces.nsIEnvironment);

    return {

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
            const WINDOWS = navigator.platform == "Win32";

            // TODO: proper pathname separator translation like Vim
            if (WINDOWS)
                path = path.replace("/", "\\", "g");

            // expand "~" to VIMPERATOR_HOME or HOME (USERPROFILE or HOMEDRIVE\HOMEPATH on Windows if HOME is not set)
            if (/^~/.test(path))
            {
                var home = environment_service.get("VIMPERATOR_HOME");

                if (!home)
                    home = environment_service.get("HOME");

                if (WINDOWS && !home)
                    home = environment_service.get("USERPROFILE") ||
                           environment_service.get("HOMEDRIVE") + environment_service.get("HOMEPATH");

                path = path.replace("~", home);
            }

            // expand any $ENV vars
            var env_vars = path.match(/\$\w+\b/g); // this is naive but so is Vim and we like to be compatible

            if (env_vars)
            {
                var expansion;

                for (var i = 0; i < env_vars.length; i++)
                {
                    expansion = environment_service.get(env_vars[i].replace("$", ""));
                    if (expansion)
                        path = path.replace(env_vars[i], expansion);
                }
            }

            return path;
        },

        getPluginDir: function ()
        {
            var plugin_dir;

            if (navigator.platform == "Win32")
                plugin_dir = "~/vimperator/plugin";
            else
                plugin_dir = "~/.vimperator/plugin";

            plugin_dir = this.getFile(this.expandPath(plugin_dir));

            return plugin_dir.exists() && plugin_dir.isDirectory() ? plugin_dir : null;
        },

        getRCFile: function ()
        {
            var rc_file1 = this.getFile(this.expandPath("~/.vimperatorrc"));
            var rc_file2 = this.getFile(this.expandPath("~/_vimperatorrc"));

            if (navigator.platform == "Win32")
                [rc_file1, rc_file2] = [rc_file2, rc_file1]

            if (rc_file1.exists() && rc_file1.isFile())
                return rc_file1;
            else if (rc_file2.exists() && rc_file2.isFile())
                return rc_file2;
            else
                return null;
        },

        // return a nsILocalFile for path where you can call isDirectory(), etc. on
        // caller must check with .exists() if the returned file really exists
        getFile: function (path)
        {
            var file = Components.classes["@mozilla.org/file/local;1"].
                                  createInstance(Components.interfaces.nsILocalFile);

            file.initWithPath(this.expandPath(path));
            return file;
        },

        // TODO: make secure
        // returns a nsILocalFile or null if it could not be created
        createTempFile: function ()
        {
            var file = Components.classes["@mozilla.org/file/local;1"].
                                  createInstance(Components.interfaces.nsILocalFile);
            if (navigator.platform == "Win32")
            {
                var dir = environment_service.get("TMP") || environment_service.get("TEMP") || "C:\\";
                file.initWithPath(dir + "\\vimperator.tmp");
            }
            else
            {
                var dir = environment_service.get("TMP") || environment_service.get("TEMP") || "/tmp/";
                file.initWithPath(dir + "/vimperator.tmp");
            }

            file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);
            if (!file.exists())
                return null;

            return file;
        },

        // file is either a full pathname or an instance of file instanceof nsILocalFile
        readDirectory: function (file)
        {
            if (typeof file == "string")
                file = this.getFile(file);
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
                file = this.getFile(file);
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
                file = this.getFile(file);
            else if (!(file instanceof Components.interfaces.nsILocalFile))
                throw Components.results.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (mode == ">>")
                mode = this.MODE_WRONLY | this.MODE_CREATE | this.MODE_APPEND;
            else if (!mode || mode == ">")
                mode = this.MODE_WRONLY | this.MODE_CREATE | this.MODE_TRUNCATE;

            if (!perms)
                perms = 0644;

            ofstream.init(file, mode, perms, 0);
            ocstream.init(ofstream, charset, 0, 0x0000);
            ocstream.writeString(buf);

            ocstream.close();
            ofstream.close();
        }
    };
};

// vim: set fdm=marker sw=4 ts=4 et:
