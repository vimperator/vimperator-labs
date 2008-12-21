
function checkFragment()
{
    let frag = document.location.hash.substr(1);
    if (!frag || document.getElementById(frag))
        return;
    let elem = document.evaluate('//*[@class="tag" and text()="' + frag + '"]', document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotItem(0);
    if (elem)
        window.content.scrollTo(0, elem.getBoundingClientRect().top - 10); // 10px context
}

document.addEventListener("load", checkFragment, true);
window.addEventListener("message", function (event) {
    if (event.data == "fragmentChange")
        checkFragment();
}, true);

document.addEventListener("click", function (event) {
    let elem = event.target;
    if (/^(option|mapping|command)$/.test(elem.className))
        var tag = elem.textContent.replace(/\s.*/, "");
    if (elem.className == "command")
        tag = tag.replace(/\[.*?\]/g, "");
    if (tag)
        elem.href = "chrome://liberator/content/help.xul?" + encodeURIComponent(tag);
}, true);

