What is Search Firefox Bookmarks
========================

Search Firefox Bookmarks (SFB) is a GNOME Shell extension which searches the firefox bookmarks and provides results in your shell overview


How to install
========================

Copy the tarball to $HOME/.local/share/gnome-shell/extensions
and unpack it. A directory called searchfirefoxbookmarks@ciancio.net
should be created. 

For use by all users, install in /usr/share/gnome-shell/extensions (https://extensions.gnome.org/extension/149/search-firefox-bookmarks-provider/).

Restart your GNOME shell (Alt-F2 r is one way) and enable the
extension using gnome-tweak-tool (install it if not present).

If the extension does not install, check the version number in
metadate.json. You may have to change it to work with your
particular version of the GNOME Shell. If this does not fix
the problem, use Looking Glass (Alt-F2 lg) to see what the
error message is.

Current Version
========================

Release 0.4.3

Other Info
========================

SFB parse bookmarks backup json file that Firefox stores usually in the dir:

	$HOME/.mozilla/firefox/<profile dir>/bookmarkbackups/

SFP try to retrieve the last json backup, but you can suggest the correct path by two way:

* setting a environment variable, FIREFOX_BOOKMARK_BACKUPS_DIR, with complete path of backup directory
* setting a environment variable, FIREFOX_BOOKMARK_FILE, with complete path of json file backup


Release 0.3: added support for IsRelative field in profiles.ini configuration file.

