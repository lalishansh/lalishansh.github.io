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

  /* Page reactions: sync counts from the utterances GitHub issue; click opens it. */

  var REACTION_META = {
    "+1": { emoji: "👍", name: "Thumbs up" },
    "-1": { emoji: "👎", name: "Thumbs down" },
    laugh: { emoji: "😄", name: "Laugh" },
    confused: { emoji: "😕", name: "Confused" },
    heart: { emoji: "❤️", name: "Heart" },
    hooray: { emoji: "🎉", name: "Hooray" },
    rocket: { emoji: "🚀", name: "Rocket" },
    eyes: { emoji: "👀", name: "Eyes" },
  };

  function initReactions() {
    var el = document.querySelector("[data-reactions]");
    if (!el) return;

    var pills = el.querySelector("[data-reactions-pills]");
    var hint = el.querySelector("[data-reactions-hint]");
    var defaults = (el.dataset.defaults || "+1,-1").split(",");
    var issueUrl = null;

    function setHint(text) {
      if (!hint) return;
      hint.textContent = text || "";
      hint.hidden = !text;
    }

    function pill(id) {
      var btn = pills.querySelector('.reactions__btn[data-reaction="' + id + '"]');
      if (btn || !REACTION_META[id]) return btn;
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reactions__btn";
      btn.dataset.reaction = id;
      btn.title = REACTION_META[id].name;
      btn.innerHTML =
        '<span class="reactions__emoji" aria-hidden="true">' +
        REACTION_META[id].emoji +
        '</span><span class="reactions__count" data-count hidden></span>';
      pills.appendChild(btn);
      return btn;
    }

    function setCount(id, n) {
      var btn = pills.querySelector('.reactions__btn[data-reaction="' + id + '"]');
      if (!btn && n > 0) btn = pill(id);
      if (!btn) return;
      if (n <= 0 && defaults.indexOf(id) === -1) {
        btn.remove();
        return;
      }
      var count = btn.querySelector("[data-count]");
      if (count) {
        count.textContent = n;
        count.hidden = n <= 0;
      }
      btn.classList.toggle("has-count", n > 0);
    }

    el.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-reaction]");
      if (!btn || !el.contains(btn)) return;
      e.preventDefault();
      var picker = btn.closest("details");
      if (picker) picker.open = false;
      if (issueUrl) {
        window.open(issueUrl, "_blank", "noopener");
      } else {
        setHint("Leave the first comment below to create this page’s GitHub issue, then you can react there.");
      }
    });

    document.addEventListener("click", function (e) {
      if (!el.contains(e.target)) {
        el.querySelectorAll("details.reactions__picker").forEach(function (d) {
          d.open = false;
        });
      }
    });

    var repo = el.dataset.repo;
    var term = el.dataset.term;
    if (!repo || !term) return;

    var q = 'repo:' + repo + ' "' + term + '" in:title';
    if (el.dataset.label) q += " label:" + el.dataset.label;

    fetch(
      "https://api.github.com/search/issues?q=" + encodeURIComponent(q) + "&per_page=1",
      { headers: { Accept: "application/vnd.github+json" } }
    )
      .then(function (r) {
        return r.ok ? r.json() : Promise.reject();
      })
      .then(function (data) {
        var issue = data.items && data.items[0];
        if (!issue) {
          setHint("Be the first to comment below — that creates the issue reactions attach to.");
          return;
        }
        issueUrl = issue.html_url;
        setHint("");
        var reactions = issue.reactions || {};
        Object.keys(REACTION_META).forEach(function (id) {
          setCount(id, reactions[id] || 0);
        });
      })
      .catch(function () {
        setHint("Could not load reaction counts from GitHub.");
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

  function initSearch() {
    var overlay = document.getElementById("site-search");
    if (!overlay || typeof Fuse === "undefined") return;

    var input = overlay.querySelector(".search-input");
    var results = overlay.querySelector(".search-results");
    var empty = overlay.querySelector(".search-empty");
    var loading = overlay.querySelector(".search-loading");
    var dialog = overlay.querySelector(".search-dialog");
    var indexUrl = document.body.getAttribute("data-search-index");
    if (!input || !indexUrl) return;

    var fuse = null;
    var activeIndex = -1;
    var currentItems = [];
    var timer = null;
    var indexPromise = null;

    function isTypingTarget(el) {
      if (!el || !el.tagName) return false;
      var tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      );
    }

    function isOpen() {
      return overlay.classList.contains("open");
    }

    // Steal keyboard focus into the search field. Called on open from both the
    // header button and Ctrl+K / /. A zero-delay timeout re-asserts after the
    // click that opened the modal finishes, because browsers otherwise leave
    // focus on the button that was pressed.
    function focusInput() {
      if (document.activeElement && document.activeElement !== input) {
        document.activeElement.blur();
      }
      input.focus({ preventScroll: true });
      input.select();
      setTimeout(function () {
        if (!isOpen()) return;
        if (document.activeElement !== input) {
          input.focus({ preventScroll: true });
          input.select();
        }
      }, 0);
    }

    function setOpen(open) {
      overlay.classList.toggle("open", open);
      overlay.hidden = !open;
      overlay.setAttribute("aria-hidden", String(!open));
      document.body.classList.toggle("search-open", open);

      if (open) {
        loadIndex();
        focusInput();
      } else {
        input.value = "";
        renderResults([]);
        empty.hidden = true;
        empty.textContent = "No results.";
      }
    }

    function loadIndex() {
      if (fuse) return indexPromise;
      loading.hidden = false;
      indexPromise = fetch(indexUrl)
        .then(function (res) {
          if (!res.ok) throw new Error(res.status);
          return res.json();
        })
        .then(function (data) {
          fuse = new Fuse(data, {
            keys: [
              { name: "title", weight: 0.5 },
              { name: "section", weight: 0.2 },
              { name: "summary", weight: 0.15 },
              { name: "content", weight: 0.15 },
            ],
            threshold: 0.4,
            ignoreLocation: true,
          });
        })
        .catch(function () {
          empty.textContent = "Could not load search index.";
          empty.hidden = false;
        })
        .finally(function () {
          loading.hidden = true;
        });
      return indexPromise;
    }

    function renderResults(items) {
      currentItems = items;
      activeIndex = items.length ? 0 : -1;
      results.textContent = "";
      empty.hidden = items.length > 0 || !input.value.trim();

      items.forEach(function (item, i) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === activeIndex));

        var link = document.createElement("a");
        link.href = item.url;
        link.className = "search-result" + (i === activeIndex ? " active" : "");
        link.tabIndex = -1;

        var title = document.createElement("span");
        title.className = "search-result-title";
        title.textContent = item.title;

        var section = document.createElement("span");
        section.className = "search-result-section";
        section.textContent = item.section;

        link.appendChild(title);
        link.appendChild(section);

        if (item.summary) {
          var summary = document.createElement("span");
          summary.className = "search-result-summary";
          summary.textContent = item.summary;
          link.appendChild(summary);
        }

        li.appendChild(link);
        results.appendChild(li);
      });
    }

    function highlightActive() {
      var links = results.querySelectorAll(".search-result");
      links.forEach(function (link, i) {
        link.classList.toggle("active", i === activeIndex);
        link.parentElement.setAttribute("aria-selected", String(i === activeIndex));
      });
      if (activeIndex >= 0 && links[activeIndex]) {
        links[activeIndex].scrollIntoView({ block: "nearest" });
      }
    }

    function runSearch() {
      var query = input.value.trim();
      if (!query) {
        renderResults([]);
        empty.hidden = true;
        return;
      }
      if (!fuse) return;
      var hits = fuse.search(query, { limit: 12 }).map(function (hit) {
        return hit.item;
      });
      renderResults(hits);
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (fuse) runSearch();
        else if (indexPromise) indexPromise.then(runSearch);
      }, 150);
    });

    // Result links would otherwise take focus on mousedown and leave the input,
    // which breaks arrow-key navigation. Keep focus on the field; navigate on click.
    results.addEventListener("mousedown", function (e) {
      if (e.target.closest(".search-result")) e.preventDefault();
    });

    results.addEventListener("mouseover", function (e) {
      var link = e.target.closest(".search-result");
      if (!link) return;
      var links = results.querySelectorAll(".search-result");
      activeIndex = Array.prototype.indexOf.call(links, link);
      highlightActive();
    });

    results.addEventListener("click", function (e) {
      var link = e.target.closest(".search-result");
      if (!link) return;
      e.preventDefault();
      setOpen(false);
      window.location.href = link.getAttribute("href");
    });

    if (dialog) {
      dialog.addEventListener("mousedown", function (e) {
        if (e.target.closest(".search-input")) return;
        if (e.target.closest(".search-result")) return;
        e.preventDefault();
        focusInput();
      });
    }

    document.querySelectorAll(".search-open").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var menu = document.getElementById("site-menu");
        if (menu) {
          menu.classList.remove("open");
          document.body.classList.remove("menu-open");
          var menuToggle = document.querySelector(".menu-toggle");
          if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
        }
        setOpen(true);
      });
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (!isOpen()) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setOpen(true);
          return;
        }
        if (e.key === "/" && !isTypingTarget(document.activeElement)) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!currentItems.length) return;
        activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
        highlightActive();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!currentItems.length) return;
        activeIndex = Math.max(activeIndex - 1, 0);
        highlightActive();
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        var link = results.querySelectorAll(".search-result")[activeIndex];
        if (link) {
          e.preventDefault();
          setOpen(false);
          window.location.href = link.getAttribute("href");
        }
      }
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
    initReactions();
    initSearch();
  });
})();
