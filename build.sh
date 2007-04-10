VERSION=0.2
FILES="chrome/content/ chrome.manifest"

# echo Building XPI...
# zip conkeror-$VERSION.xpi $FILES install.js
# mv conkeror-$VERSION.xpi ../downloads

zip -r chrome/vimperator.jar $FILES
#cp vimperator.jar chrome
# also put it in our firefox install
cp -v chrome/vimperator.jar '/home/maxauthority/.mozilla/firefox/kc3gnd7k.default/extensions/{f9570b26-e246-4753-9b68-61aa95994237}/chrome'

# Build an xpi
if [ x$1 = xxpi ]; then
    echo Building XPI...
    zip -r vimperator_$VERSION.xpi chrome/vimperator.jar install.rdf chrome.manifest TODO
    #mv vimperator-firefox-$VERSION.xpi ../downloads
fi


if [ x$1 = xtest ]; then
	cp -v chrome/vimperator.jar '/home/test/.mozilla/firefox/trsj6obw.default//extensions/{f9570b26-e246-4753-9b68-61aa95994237}/chrome'
fi
