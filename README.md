# absoluteworkout

A personal workout planner and in-gym set tracker.

**[Open the app →](https://absoluteworkout.win/)**

---

A small training tool I built for myself and a couple of friends. It plans a
few workout splits, tracks sets during a session, and shows how the week's
volume landed. That's it.

Personal project — not a product, not affiliated with anyone, and **not medical
advice**. It's built around individual training constraints; anyone using it
should check their own plan against whoever advises them.

## Run locally

No build step, but it must be served over HTTP — opening the files directly
(`file://`) won't work:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## License

[MIT](LICENSE)
