# ListRow

The booking and settings row: category icon tile, title + meta, trailing time or chevron.

Min height 56px (68px with an icon tile). Icon tile 40px, `radius-md` − 2px, category soft fill with the category's strong stroke (flight `info`, stay `stay`, train `accent`, ticket `success`). Title `body` at 600, meta `caption` in `ink-muted`, trailing `caption` in `ink-muted`. Rows live inside a Card group and are divided by 1px `line`. A whole-row link uses `a`, not a clickable div. The consumer provides the category, title, meta and trailing value.
