
document.addEventListener("click", function (event) {
    let elem = event.target;
    if (/^(option|mapping|command)$/.test(elem.className))
        elem.setAttribute("href", "chrome://liberator/content/help.xul?" + encodeURIComponent(elem.textContent.replace(/\s.*/, "")));
}, true);

