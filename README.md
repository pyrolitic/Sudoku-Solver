Sudoku solver
=============
Client side javascript sudoku solver using dancing links. It was fun to write. It uses Canvas to draw the board,
which doesn't seem to work in Internet explorer, even the latest version.

- `sudoku.js` is the solver back end, implementing Algorithm X. It's surprisingly short.
- `sudoku_ui.js` is the front end. It ended up being surprisingly complicated.
- `encoding.js` has base64 and huffman coding. Turns out `btoa` and `atob` do not work on arbitrary binary data.
- `sudoku.html` is the page definition, though the editing buttons are added dynamically.
- `style.css` is the stylesheet.

License
=======
The MIT License (MIT)

Copyright (c) 2013, 2021 Jonathan Roșca

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
