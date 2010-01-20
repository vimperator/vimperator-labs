// Copyright (c) 2009 by Kris Maglione <kris@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


function checkFragment() {
    document.title = document.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "title")[0].textContent;
    var frag = document.location.hash.substr(1);
    var elem = document.getElementById(frag);
    if (elem)
        window.content.scrollTo(0, window.content.scrollY + elem.getBoundingClientRect().top - 10); // 10px context
}

document.addEventListener("load", checkFragment, true);
window.addEventListener("message", function (event) {
    if (event.data == "fragmentChange")
        checkFragment();
}, true);

// vim: set fdm=marker sw=4 ts=4 et:
