//   Firefox Bookmarks Search Provider for Gnome Shell
//   Copyright (C) 2011  Stefano Ciancio
//
//   This library is free software; you can redistribute it and/or
//   modify it under the terms of the GNU Library General Public
//   License as published by the Free Software Foundation; either
//   version 2 of the License, or (at your option) any later version.
//
//   This library is distributed in the hope that it will be useful,
//   but WITHOUT ANY WARRANTY; without even the implied warranty of
//   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
//   Library General Public License for more details.
//
//   You should have received a copy of the GNU Library General Public
//   License along with this library; if not, write to the Free Software
//   Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA

const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;
const St = imports.gi.St;

// Settings

// FBSearchProvider holds the instance of the search provider
// implementation. If null, the extension is either uninitialized
// or has been disabled via disable().
let FBSearchProvider = null;

let firefoxApp = Shell.AppSystem.get_default().initial_search(['firefox'])[0];


const FirefoxBookmarksSearchProvider = new Lang.Class({
    Name: 'FirefoxBookmarksSearchProvider',
    
    _init: function(title) {
        this.title = title;

        // Retrieve environment variables
        this.FirefoxBookmarkBackupsDir = GLib.getenv("FIREFOX_BOOKMARK_BACKUPS_DIR");
        this.FirefoxBookmarkFile = GLib.getenv("FIREFOX_BOOKMARK_FILE");

        // Check environment variables
        if (this.FirefoxBookmarkFile) {
            // Env Bookmark File defined
            this.bookmarkFilePath = this.FirefoxBookmarkFile;
        } else if (this.FirefoxBookmarkBackupsDir) {
            // Env Bookmark Dir defined
            if (!(this.bookmarkFilePath =
                    this._getBookmarkFilePath(this.FirefoxBookmarkBackupsDir))) {
                return false;
            }
        } else {
            // Default
            let firefoxProfileFile = GLib.build_filenamev(
                [GLib.get_home_dir(), ".mozilla/firefox/profiles.ini"]);
            let [result, defaultProfile, defaultIsRelative] = this._getFirefoxDefaultProfile(firefoxProfileFile),
                mozillaDefaultDirPath = "";

            if (defaultIsRelative) {
                mozillaDefaultDirPath = GLib.build_filenamev([
                    GLib.get_home_dir(), ".mozilla/firefox/",
                    defaultProfile, "bookmarkbackups/"
                ]);
            } else {
                mozillaDefaultDirPath = GLib.build_filenamev(
                        [defaultProfile, "bookmarkbackups/"]);
            }

            if (!(this.bookmarkFilePath =
                    this._getBookmarkFilePath(mozillaDefaultDirPath))) {
                return false;
            }
        }

        this._configBookmarks = [];

        this._readBookmarks();

        let file = Gio.file_new_for_path(this.bookmarkFilePath);
        this._bookmarkFileMonitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
        this._bookmarkFileMonitor.connect('changed',
                Lang.bind(this, this._readBookmarks));

        return true;
    },

    _getFirefoxDefaultProfile: function (firefoxProfileFile) {
        let last_path, last_default, last_isrelative, default_path, default_isrelative;

        if (GLib.file_test(firefoxProfileFile, GLib.FileTest.EXISTS)) {
            let filedata = GLib.file_get_contents(firefoxProfileFile, null, 0);

            if (filedata[0]) {
                let lines = String(filedata[1]).split('\n');

                for (let i = 0; i < lines.length; i++) {
                    if (lines[i] === '') continue;           // empty lines

                    let key_value = lines[i].match(/^([^=]+)=(.+)$/);
                    if (key_value != null) {                // key-value pair
                        switch (key_value[1]) {
                        case 'Path':
                            last_path = key_value[2];
                            break;
                        case 'IsRelative':
                            last_isrelative = key_value[2];
                            break;
                        case 'Default':
                            last_default = key_value[2];
                            break;
                        }
                        default_path = last_path;
                        default_isrelative = last_isrelative;
                        if (last_default == 1)
                            break;
                        else
                            continue;
                    }
                }
            }

        } else return [false, "File not exist"];

        return [true, default_path, default_isrelative];
    },

    // Read all bookmarks tree
    _readBookmarks : function () {

        let filedata;
        try {
            filedata = GLib.file_get_contents(this.bookmarkFilePath, null, 0);
        } catch (e) {
            Main.notifyError("Error reading file", e.message);
            return false;
        }

        let jsondata = null;
        if (filedata[1] && filedata[1].length) {
            try {
                jsondata = JSON.parse(filedata[1]);
            } catch (e) {
                Main.notifyError("Error parsing file - " + filedata, e.message);
                return false;
            }
        } else {
            Main.notifyError("Error parsing file - Empty data");
            return false;
        }

        // Check to find right tree
        for (let i = 0; i < jsondata.children.length; i++) {
            let child = jsondata.children[i];

            if (child.root === 'tagsFolder') continue;

            this._readTree(child.children, this);
        }

        return true;
    },

    _readTree : function (node) {

        let child;

        // For each child ...
        for (let i = 0; i < node.length; i++) {
            child = node[i];

            if (child.hasOwnProperty('type')) {
                if (child.type === 'text/x-moz-place') {
                    this._configBookmarks.push([child.title, child.uri]);
                }

                if (child.type === 'text/x-moz-place-container') {
                    this._readTree(child.children);
                }
            }
        }
    },

    // Return complete path of bookmark json file
    // bookmarkDir: dir of json bookmark file
    _getBookmarkFilePath : function (bookmarkDir) {
        let dir = '',
            backupEnum;
        if ((bookmarkDir) && GLib.file_test(bookmarkDir, GLib.FileTest.IS_DIR)) {
            dir = Gio.file_new_for_path(bookmarkDir);
            backupEnum = dir.enumerate_children(
                'standard::name,standard::type,time::modified',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
        } else {
            Main.notifyError("Directory Error", bookmarkDir + " seems doesn't exist");
            return false;
        }

        let infoTimeVal = new GLib.TimeVal(),
            max = 0,
            info,
            lastFile;
        while ((info = backupEnum.next_file(null)) != null) {

            let type = info.get_file_type();

            if (type === Gio.FileType.REGULAR) {

                let infoTimeVal;
                infoTimeVal = info.get_modification_time();

                if (infoTimeVal.tv_sec > max) {
                    max = infoTimeVal.tv_sec;
                    lastFile = info;

                }
            }
        }
        backupEnum.close(null);

        if (!lastFile ||
                !GLib.file_test(
                    GLib.build_filenamev([bookmarkDir, lastFile.get_name()]),
                    GLib.FileTest.EXISTS
                )) {
            Main.notifyError("Directory Error", "It seems are no files in " + bookmarkDir);
            return false;
        }

        return GLib.build_filenamev([bookmarkDir, lastFile.get_name()]);
    },

    filterResults: function(providerResults, maxResults) {
        return providerResults;
    },

    createResultObject: function(result, terms) {
        return null;
    },

    getResultMeta: function (id) {
        let bookmark_name = "";
        if (id.name.trim())
            bookmark_name = id.name;
        else
            bookmark_name = id.url;

        let createIcon;
        if (firefoxApp) {
            createIcon = function (size) {
                return firefoxApp.create_icon_texture(size);
            };
        } else {
            createIcon = function (size) {
                return new St.Icon({
                    gicon: new Gio.ThemedIcon({name: 'firefox'}),
                    icon_size: size
                });
            };
        }

        return {
            id: id,
            name: bookmark_name,
            createIcon: createIcon
        };
    },

    getResultMetas: function (resultIds, callback) {
        let results = resultIds.map(this.getResultMeta);
        if (callback) {
            callback(results);
        }
        return results;
    },

    activateResult: function (id) {
        if (firefoxApp) {
            firefoxApp.launch(global.get_current_time(), [id.url], -1);
        } else {
            Util.spawn(['/usr/bin/firefox', '--new-tab', id.url]);
        }
    },

    _checkBookmarknames: function (bookmarks, terms) {
        terms = terms.map(function (w) { return w.toLowerCase(); });
        let searchResults = [];
        // we give +2 for each term matching the name,
        // +1 for each term matching the URL, and additional
        // +1 if it matches at the start of the name.
        for (let i = 0; i < bookmarks.length; i++) {
            let name = bookmarks[i][0];
            let url = bookmarks[i][1];
            let score = 0;
            for (let j = 0; j < terms.length; j++) {
                let term = terms[j];
                if (url.toLowerCase().indexOf(term) > -1) {
                    ++score;
                }
                let index = name.toLowerCase().indexOf(term);
                if (index > -1) {
                    score += 2;
                }
                if (index === 0) {
                    ++score;
                }
                if (score) {
                    searchResults.push({
                        name: name,
                        url: url,
                        score: score
                    });
                }
            }
        }
        // sort by descending score, ascending alphabetical to break ties.
        searchResults.sort(function (r1, r2) {
            return (r1.score < r2.score) ||
                    (r1.name > r2.name);
        });
        return searchResults;
    },

    getInitialResultSet: function (terms) {
        // check if a found host-name begins like the search-term
        let results = this._checkBookmarknames(this._configBookmarks, terms);
        this.searchSystem.setResults(this, results);
        return results;
    },

    getSubsearchResultSet: function (previousResults, terms) {
        return this.getInitialResultSet(terms);
    },

    createResultActor: function (resultMeta, terms) {
        return null;
    },
    destroy: function () {
        this._bookmarkFileMonitor.cancel();
    }
});

function init() {
}

function enable() {
    if (!FBSearchProvider) {
        FBSearchProvider = new FirefoxBookmarksSearchProvider("FIREFOX BOOKMARKS");
        Main.overview.addSearchProvider(FBSearchProvider);
    }
}

function disable() {
    if (FBSearchProvider) {
        Main.overview.removeSearchProvider(FBSearchProvider);
        FBSearchProvider.destroy();
        FBSearchProvider = null;
    }
}

