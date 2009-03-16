
function checkFragment()
{
    let frag = document.location.hash.substr(1);
    if (!frag || document.getElementById(frag))
        return;
    let elem = document.evaluate('//*[@class="tag" and text()="' + frag + '"]', document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotItem(0);
    if (elem)
        window.content.scrollTo(0, window.content.scrollY + elem.getBoundingClientRect().top - 10); // 10px context
}

document.addEventListener("load", checkFragment, true);
window.addEventListener("message", function (event) {
    if (event.data == "fragmentChange")
        checkFragment();
}, true);

document.addEventListener("click", function (event) {
    let evt = document.createEvent("UIEvents");
    evt.initEvent("liberatorHelpLink", true, true);
    event.target.dispatchEvent(evt);
}, true);

// vim: set fdm=marker sw=4 ts=4 et:
