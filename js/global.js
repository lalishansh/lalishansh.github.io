/* =========================================
   Theme handling

   Loaded from <head> without `defer`, so the stored theme is applied before
   the first paint and the page never flashes the default scheme.
   ========================================= */

(function () {
  var root = document.documentElement;
  var STORAGE_KEY = "theme";

  var stored = localStorage.getItem(STORAGE_KEY);
  if (stored) root.setAttribute("data-theme", stored);

  // Walk every rule in every same-origin stylesheet and collect the scheme
  // names, so the CSS stays the single source of truth.
  function collectThemes() {
    var seen = [];
    var pattern = /\[data-theme="([^"]+)"\]/g;

    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.cssRules) walk(rule.cssRules);
        if (!rule.selectorText) continue;
        var m;
        while ((m = pattern.exec(rule.selectorText)) !== null) {
          if (seen.indexOf(m[1]) === -1) seen.push(m[1]);
        }
      }
    }

    for (var s = 0; s < document.styleSheets.length; s++) {
      try {
        walk(document.styleSheets[s].cssRules);
      } catch (e) {
        // Cross-origin stylesheet: rules are not readable, skip it.
      }
    }
    return seen;
  }

  function label(name) {
    return name.replace(/-/g, " ").replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  // Reflects the active scheme on every picker on the page: the header flyout
  // and the mobile overlay each have one.
  function syncPickers() {
    var current = root.getAttribute("data-theme");

    document.querySelectorAll(".theme-list .theme-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.theme === current));
    });

    // The summary swatch carries data-theme so it previews the active scheme.
    document.querySelectorAll(".theme-current").forEach(function (b) {
      if (current) {
        b.dataset.theme = current;
        b.title = label(current);
      } else {
        delete b.dataset.theme;
        b.title = "Theme";
      }
    });
  }

  function buildPicker() {
    var pickers = document.querySelectorAll(".theme-picker");
    if (!pickers.length) return;

    var themes = collectThemes();
    if (!themes.length) return;

    pickers.forEach(function (picker) {
      // The overlay shows every swatch at once and needs no summary button.
      if (!picker.classList.contains("inline")) {
        var summary = document.createElement("button");
        summary.type = "button";
        summary.className = "theme-btn theme-current";
        summary.setAttribute("aria-label", "Theme");
        picker.appendChild(summary);
      }

      var list = document.createElement("div");
      list.className = "theme-list";

      themes.forEach(function (name) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "theme-btn";
        button.dataset.theme = name;
        button.title = label(name);
        button.setAttribute("aria-label", label(name));
        button.addEventListener("click", function () {
          root.setAttribute("data-theme", name);
          localStorage.setItem(STORAGE_KEY, name);
          syncPickers();
          syncUtterancesTheme();
        });
        list.appendChild(button);
      });

      picker.appendChild(list);
    });

    syncPickers();
  }

  function syncUtterancesTheme() {
    var iframe = document.querySelector("iframe.utterances-frame");
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "set-theme", theme: utterancesTheme() },
      "https://utteranc.es"
    );
  }

  // Maps the active base16 scheme to the utterances themes, which are limited
  // to github-light and github-dark.
  function utterancesTheme() {
    var name = root.getAttribute("data-theme") || "";
    if (!name) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "github-dark"
        : "github-light";
    }
    if (/dark|dracula|nord|gruvbox/i.test(name)) return "github-dark";
    return "github-light";
  }

  function initUtterances() {
    window.addEventListener("message", function (e) {
      if (e.origin !== "https://utteranc.es") return;
      if (e.data && e.data.type === "utterances-ready") {
        syncUtterancesTheme();
      }
    });
  }

  function initMenu() {
    var toggle = document.querySelector(".menu-toggle");
    var menu = document.getElementById("site-menu");
    if (!toggle || !menu) return;

    function setOpen(open) {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(!menu.classList.contains("open"));
    });

    var close = menu.querySelector(".menu-close");
    if (close) {
      close.addEventListener("click", function () {
        setOpen(false);
      });
    }

    // Navigating away closes it; picking a theme deliberately does not.
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  }

  // Highlight the table-of-contents entry for the heading currently on screen.
  // Expand/collapse for the asides beside the article: the outline and the docs
  // tree. Each carries data-panel, whose value names the class the layout gets
  // while that panel is collapsed, so the two collapse independently.
  //
  // The listener goes on the heading rather than the button so the whole title
  // row is a target; a click on the button bubbles up to it, so it still fires
  // once, and the button stays the focusable control for keyboard use.
  function initPanels() {
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      var name = panel.getAttribute("data-panel");
      var title = panel.querySelector(".panel-title");
      var toggle = panel.querySelector(".panel-toggle");
      if (!title || !toggle) return;

      var layout = panel.closest(".page-layout");
      var label = toggle.getAttribute("aria-label") || "";
      // "Collapse contents" -> "contents", so the expanded label can be built
      // from whatever the markup called this panel.
      var noun = label.replace(/^(Collapse|Expand)\s+/, "");

      title.addEventListener("click", function () {
        var collapsed = panel.classList.toggle("collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute(
          "aria-label",
          (collapsed ? "Expand " : "Collapse ") + noun
        );
        // Lets the text column reclaim the width the panel gives up.
        if (layout) layout.classList.toggle(name + "-collapsed", collapsed);
      });
    });

    // Inside the tree, a folder's <summary> holds a link to that folder's own
    // page. Without this a click on the link would also toggle the folder,
    // since summary activation fires for any click that reaches it.
    document.querySelectorAll(".tree summary a").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    });
  }

  function initTocScrollSpy() {
    var toc = document.querySelector(".toc");
    if (!toc || !("IntersectionObserver" in window)) return;

    var outline = toc.querySelector("nav");
    if (!outline) return;

    var headings = [];
    var order = {};

    outline.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      var heading = document.getElementById(id);
      if (!heading) return;
      order[id] = headings.length;
      headings.push(heading);
    });
    if (!headings.length) return;

    var visible = [];
    var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Pinned bar: fixed, and appended to <body> rather than left in the
    // article, so neither showing it nor opening its dropdown affects layout.
    var bar = document.createElement("div");
    bar.className = "toc-bar";

    var title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = "Contents";

    var barToggle = document.createElement("button");
    barToggle.type = "button";
    barToggle.className = "panel-toggle";
    barToggle.setAttribute("aria-expanded", "false");
    barToggle.setAttribute("aria-label", "Show contents");
    title.appendChild(barToggle);

    var path = document.createElement("div");
    path.className = "toc-path";

    var dropdown = document.createElement("div");
    dropdown.className = "toc-dropdown";
    var clone = outline.cloneNode(true);
    clone.removeAttribute("id"); // Hugo's #TableOfContents must stay unique.
    dropdown.appendChild(clone);

    bar.appendChild(title);
    bar.appendChild(path);
    bar.appendChild(dropdown);
    document.body.appendChild(bar);

    // Every heading now has two entries, one in the article and one in the
    // dropdown; both are highlighted together.
    function linksFor(id) {
      var selector = 'a[href="#' + CSS.escape(id) + '"]';
      return [outline.querySelector(selector), dropdown.querySelector(selector)];
    }

    function setBarOpen(open) {
      bar.classList.toggle("expanded", open);
      barToggle.setAttribute("aria-expanded", String(open));
      barToggle.setAttribute("aria-label", open ? "Hide contents" : "Show contents");
      if (open && current) {
        revealIn(dropdown, dropdown.querySelector('a[href="#' + CSS.escape(current) + '"]'));
      }
    }

    title.addEventListener("click", function () {
      setBarOpen(!bar.classList.contains("expanded"));
    });

    // Closing on selection keeps the dropdown from covering the target.
    dropdown.addEventListener("click", function (e) {
      if (e.target.closest("a")) setBarOpen(false);
    });

    // Following a crumb jumps away, so leaving the dropdown open behind it
    // would only obscure the destination.
    path.addEventListener("click", function (e) {
      if (e.target.closest("a")) setBarOpen(false);
    });

    // Collapse once the pointer leaves, and on any tap outside for touch.
    bar.addEventListener("mouseleave", function () {
      setBarOpen(false);
    });

    document.addEventListener("pointerdown", function (e) {
      if (!bar.contains(e.target)) setBarOpen(false);
    });

    // Show the bar only once the article's own outline is off screen.
    new IntersectionObserver(function (entries) {
      bar.classList.toggle("visible", !entries[0].isIntersecting);
      if (entries[0].isIntersecting) setBarOpen(false);
    }).observe(toc);

    // Ancestors of an entry are the <a> of each enclosing <li>, which is how
    // Hugo nests the outline.
    function ancestry(link) {
      var trail = [];
      var node = link.closest("li");
      while (node) {
        var a = node.querySelector(":scope > a");
        if (a) trail.unshift(a);
        node = node.parentElement ? node.parentElement.closest("li") : null;
      }
      return trail;
    }

    function renderPath(id) {
      path.textContent = "";
      var link = outline.querySelector('a[href="#' + CSS.escape(id) + '"]');
      if (!link) return;
      // Anchors rather than plain text, so the trail doubles as a way back up
      // to any enclosing section.
      ancestry(link).forEach(function (a) {
        var crumb = document.createElement("a");
        crumb.className = "crumb";
        crumb.href = a.getAttribute("href");
        crumb.textContent = a.textContent;
        path.appendChild(crumb);
      });
    }

    // Scroll a container just enough to bring an entry into view. Only the
    // container moves; the page never does.
    function revealIn(scroller, link) {
      if (!link || scroller.scrollHeight <= scroller.clientHeight) return;
      if (scroller.matches(":hover")) return;

      var pad = 8;
      var box = scroller.getBoundingClientRect();
      var item = link.getBoundingClientRect();
      var delta = 0;

      if (item.top < box.top + pad) {
        delta = item.top - box.top - pad;
      } else if (item.bottom > box.bottom - pad) {
        delta = item.bottom - box.bottom + pad;
      }
      if (!delta) return;

      scroller.scrollTo({
        top: scroller.scrollTop + delta,
        behavior: smooth ? "smooth" : "auto",
      });
    }

    var current = null;

    function activate(id) {
      if (id === current) return;
      if (current) {
        linksFor(current).forEach(function (a) {
          if (a) a.classList.remove("active");
        });
      }
      current = id;

      var pair = linksFor(id);
      pair.forEach(function (a) {
        if (a) a.classList.add("active");
      });

      renderPath(id);
      revealIn(outline, pair[0]);
      if (bar.classList.contains("expanded")) revealIn(dropdown, pair[1]);
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.id;
          var i = visible.indexOf(id);
          if (entry.isIntersecting && i === -1) visible.push(id);
          if (!entry.isIntersecting && i !== -1) visible.splice(i, 1);
        });

        if (!visible.length) return;
        // Pick whichever visible heading comes first in document order.
        var first = visible.slice().sort(function (a, b) {
          return order[a] - order[b];
        })[0];
        if (first) activate(first);
      },
      { rootMargin: "0px 0px -70% 0px" }
    );

    // Something to show before the first heading scrolls into range.
    renderPath(headings[0].id);

    headings.forEach(function (h) {
      observer.observe(h);
    });
  }

  function initBackToTop() {
    var button = document.querySelector(".to-top");
    if (!button) return;

    var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function update() {
      button.classList.toggle("visible", window.scrollY > 400);
    }

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    });

    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  // Offers a way back after a jump. Following a contents entry or Back to top
  // loses the reader's place with no browser affordance to recover it, so the
  // position is recorded beforehand and offered back until they have scrolled
  // far enough from the landing point to have moved on.
  function initReturn() {
    var button = document.querySelector(".to-return");
    if (!button) return;

    var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var origin = null; // where the reader was before the jump
    var landed = null; // where the jump finished, once scrolling stopped
    var timer = null;

    // Far enough from the landing point to count as having moved on, and the
    // shortest jump still worth offering to undo.
    var DISMISS_AFTER = 300;
    var WORTH_OFFERING = 100;

    function hide() {
      button.classList.remove("visible");
      origin = null;
      landed = null;
    }

    function mark() {
      origin = window.scrollY;
      landed = null;
      button.classList.add("visible");
    }

    // Capture phase, so the position is read before the handler that scrolls.
    document.addEventListener(
      "click",
      function (e) {
        if (!e.target.closest) return;
        if (e.target.closest(".to-return")) return;

        var jumped =
          e.target.closest('.toc a[href^="#"]') ||
          e.target.closest('.toc-dropdown a[href^="#"]') ||
          e.target.closest('.toc-path a[href^="#"]') ||
          e.target.closest(".to-top");

        if (jumped) mark();
      },
      true
    );

    button.addEventListener("click", function () {
      if (origin === null) return hide();
      var target = origin;
      hide();
      window.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
    });

    window.addEventListener(
      "scroll",
      function () {
        if (origin === null) return;

        if (landed === null) {
          // Smooth scrolling fires events the whole way to the destination, so
          // wait for a pause before treating a position as the landing point.
          clearTimeout(timer);
          timer = setTimeout(function () {
            if (origin === null) return;
            landed = window.scrollY;
            // A jump that barely moved leaves nothing worth going back to.
            if (Math.abs(landed - origin) < WORTH_OFFERING) hide();
          }, 150);
          return;
        }

        if (Math.abs(window.scrollY - landed) > DISMISS_AFTER) hide();
      },
      { passive: true }
    );
  }

  function initCodeBlocks() {
    document.querySelectorAll(".code-block").forEach(function (block) {
      var copy = block.querySelector(".code-copy");
      var collapse = block.querySelector(".code-collapse");

      if (copy) {
        copy.addEventListener("click", function () {
          // With lineNumbersInTable the numbers live in their own cell; read
          // the last one so they are never copied along with the code.
          var cells = block.querySelectorAll(".lntd");
          var source = cells.length ? cells[cells.length - 1] : block;
          var code = source.innerText.replace(/\n$/, "");

          navigator.clipboard.writeText(code).then(
            function () {
              copy.textContent = "Copied";
              copy.classList.add("copied");
              setTimeout(function () {
                copy.textContent = "Copy";
                copy.classList.remove("copied");
              }, 1500);
            },
            function () {
              copy.textContent = "Failed";
              setTimeout(function () {
                copy.textContent = "Copy";
              }, 1500);
            }
          );
        });
      }

      if (collapse) {
        collapse.addEventListener("click", function () {
          var collapsed = block.classList.toggle("collapsed");
          collapse.setAttribute("aria-expanded", String(!collapsed));
          collapse.setAttribute(
            "aria-label",
            collapsed ? "Expand code" : "Collapse code"
          );
        });
      }
    });
  }

  // A <table> cannot scroll on its own without breaking column layout, so
  // each one gets a scrollable wrapper.
  function initTables() {
    var tables = document.querySelectorAll(".page-content table:not(.lntable)");
    tables.forEach(function (table) {
      if (table.closest(".table-wrap")) return;
      var wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildPicker();
    initMenu();
    initPanels();
    initTocScrollSpy();
    initBackToTop();
    initReturn();
    initCodeBlocks();
    initTables();
    initUtterances();
  });
})();
