"use strict";

function lerp(a, b, x, max) {
    return (max - x) * a + b * x;
}

function terp3(a, b, cs) {
    let c = 1 - a - b;
    return [
        (a * cs[0][0] + b * cs[1][0] + c * cs[2][0]) | 0,
        (a * cs[0][1] + b * cs[1][1] + c * cs[2][1]) | 0,
        (a * cs[0][2] + b * cs[1][2] + c * cs[2][2]) | 0
    ];
}

function lerp3(a, b, x) {
    return [
        (a[0] * (1 - x) + b[0] * x) | 0,
        (a[1] * (1 - x) + b[1] * x) | 0,
        (a[2] * (1 - x) + b[2] * x) | 0
    ];
}

const sectColEnds = [
    [0x98, 0xda, 0x1f], //left
    [0xd6, 0x28, 0x28], //right
    [0xe9, 0xc4, 0x6a], //up
    [0x2a, 0x9d, 0x8f] //down
];

const maxSize = 16;
const maxCellBase = maxSize + 1;

class Board {
    constructor(canvasContext) {
        this.size = 0; //per side

        // 3 layers of data, all 1 based:
        // on a classic 9x9 sudoku, this is a 3x3 cell
        // changing this resets arrays below
        this.section = null;
        this.sectionPlusDrag = null; //for drawing enlarged sections while dragging
        this.sectionCols = null;
        this.sectionSize = null;
        // user-inputted cell values
        // changing this rests additions
        this.data = null;
        // solver added cell values
        this.additions = null;
        // error highlighter when 
        this.errorTimer = null;

        this.errorTimerMax = 5;

        this.state = "adding"; //adding, solved

        //selection
        this.sX = 0;
        this.sY = 0;

        // drag start
        this.dragging = false;
        this.dsX = 0;
        this.dsY = 0;
        // drag last cell
        this.dlX = 0;
        this.dlY = 0;

        //drawing
        this.context = canvasContext;
        this.w = 500;
        this.h = 500;
        this.f = 0;

        this.normalCol = "rgb(250, 250, 250)";
        this.errorCol = "rgb(255, 60, 60)";
        this.fixedCol = "rgb(50, 50, 50)";
        this.completedCol = "rgb(80, 120, 190)";

        this.solutionGen = null;
    }

    errorColStage(x) {
        /*let r;
        if (x > this.errorTimerMax - 4) r = lerp(200, 255, x - this.errorTimerMax, 4);
        else r = lerp(255, 70, x - this.errorTimerMax - 4, this.errorTimerMax - 4);*/

        let r = (x * 255) / this.errorTimerMax + 150;
        return "rgb(" + Math.floor(r) + ", " + 70 + ", " + 70 + ")";
    }

    paint() {
        this.context.clearRect(0, 0, this.w, this.h);

        //first the sectors
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                let s = this.sectionPlusDrag[i * this.size + j];
                let c = this.sectionCols[s];
                this.context.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
                this.context.fillRect(j * this.f, i * this.f, this.f, this.f);
            }
        }

        //the selection highlighter
        //this.context.globalCompositeOperation = "lighter";
        //let selSect = this.sectionPlusDrag[this.sY * this.size + this.sX];
        //let selCol = this.sectionCols[selSect];
        //this.context.strokeStyle = "rgb(" + (255 - selCol[0]) + "," + (255 - selCol[1]) + "," + (255 - selCol[2]) + ")";
        this.context.strokeStyle = "rgb(40, 40, 40)";
        this.context.lineWidth = 1;
        this.context.beginPath();
        let d = 2;
        for (; d < this.f; d += 7) {
            this.context.moveTo(this.sX * this.f + d, this.sY * this.f);
            this.context.lineTo(this.sX * this.f, this.sY * this.f + d);

            this.context.moveTo((this.sX + 1) * this.f - d, this.sY * this.f);
            this.context.lineTo((this.sX + 1) * this.f, this.sY * this.f + d);
        }
        for (; d < 2 * this.f; d += 7) {
            let over = d - this.f;
            this.context.moveTo((this.sX + 1) * this.f, this.sY * this.f + over);
            this.context.lineTo(this.sX * this.f + over, (this.sY + 1) * this.f);

            this.context.moveTo(this.sX * this.f, this.sY * this.f + over);
            this.context.lineTo((this.sX + 1) * this.f - over, (this.sY + 1) * this.f);
        }

        this.context.closePath();
        this.context.stroke();

        //the section borders
        this.context.strokeStyle = "rgba(0, 0, 0, 255)";
        this.context.lineWidth = 5;
        this.context.beginPath();
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                let s00 = this.sectionPlusDrag[i * this.size + j];
                if (j < this.size - 1 && s00 != this.sectionPlusDrag[i * this.size + j + 1]) {
                    this.context.moveTo((j + 1) * this.f, i * this.f);
                    this.context.lineTo((j + 1) * this.f, (i + 1) * this.f);
                    this.context.closePath();
                }
                if (i < this.size - 1 && s00 != this.sectionPlusDrag[(i + 1) * this.size + j]) {
                    this.context.moveTo((j) * this.f, (i + 1) * this.f);
                    this.context.lineTo((j + 1) * this.f, (i + 1) * this.f);
                    this.context.closePath();
                }
            }
        }
        this.context.stroke();

        //then the grid
        this.context.strokeStyle = "rgba(0, 0, 0, 255)";
        this.context.lineWidth = 5;
        this.context.beginPath();
        this.context.moveTo(0, 0);
        this.context.lineTo(this.w, 0);
        this.context.lineTo(this.w, this.h);
        this.context.lineTo(0, this.h);
        this.context.lineTo(0, 0);
        this.context.closePath();
        this.context.stroke();

        for (let i = 0; i <= this.size; i++) {
            this.context.lineWidth = 1;

            this.context.beginPath();
            this.context.moveTo(i * this.f, 0);
            this.context.lineTo(i * this.f, this.h);
            this.context.closePath();
            this.context.stroke();

            this.context.beginPath();
            this.context.moveTo(0, i * this.f);
            this.context.lineTo(this.w, i * this.f);
            this.context.closePath();
            this.context.stroke();
        }

        //now the numbers
        this.context.strokeStyle = "rgba(0, 0, 0, 255)";
        this.context.font = ((45 * 9 / this.size) | 0) + "pt Helvetica";
        for (let j = 0; j < this.size; j++) {
            for (let i = 0; i < this.size; i++) {
                let sym = this.data[i + j * this.size];
                if (this.state === "solved") {
                    if (sym == 0) {
                        sym = this.additions[i + j * this.size];
                        this.context.fillStyle = this.completedCol;
                    } else this.context.fillStyle = this.fixedCol;
                } else {
                    let err = this.errorTimer[i + j * this.size];
                    this.context.fillStyle = (err > 0) ? this.errorColStage(err) : this.normalCol;
                }

                if (sym != 0) {
                    let x = i * this.f + 12 * 9 / this.size;
                    let y = (j + 1) * this.f - 7 * 9 / this.size;
                    let str = sym.toString(this.size + 1);
                    this.context.fillText(str, x, y);
                    this.context.lineWidth = 1.2;
                    this.context.strokeText(str, x, y);
                }
            }
        }
    }

    updateSections() {
        for (let sym = 0; sym < this.size; sym++) {
            this.sectionSize[sym] = 0;
        }

        for (let i = 0; i < this.size * this.size; i++) {
            this.sectionSize[this.section[i]]++;
        }
    }

    getSize() {
        return this.size;
    }

    setSize(sz) {
        if (sz < 1) sz = 1;
        this.size = sz;
        this.data = new Array(this.size * this.size);
        this.section = new Array(this.size * this.size);
        this.sectionPlusDrag = new Array(this.size * this.size);
        this.additions = new Array(this.size * this.size);
        this.sectionCols = new Array(this.size);
        this.sectionSize = new Array(this.size);
        this.errorTimer = new Array(this.size * this.size);
        this.reset();
    }

    setGrid(sz, sect, grid) {
        this.setSize(sz);
        for (let i = 0; i < this.size * this.size; i++) {
            this.data[i] = grid[i];
            this.section[i] = sect[i];
            this.sectionPlusDrag[i] = sect[i];
            this.sectionSize[this.section[i]]++;
        }
        this.updateSections();
        this.state = "adding";
        this.additions = new Array(this.size * this.size); //reset previous solution
    }

    resetAdditions() {
        for (let i = 0; i < this.size * this.size; i++) {
            this.additions[i] = 0;
        }
        this.state = "adding";
        this.solutionGen = null;
    }

    reset() {
        this.clear();

        //create some sections, can't guarantee they're all the same size
        //this will only properly work when size is a power of 2 so it can be split into an even grid
        let sectCols = Math.ceil(Math.sqrt(this.size));
        let numWholeRows = (this.size / sectCols) | 0;
        let numRows = numWholeRows + ((this.size % sectCols == 0) ? 0 : 1);
        let sectRows = Math.floor(this.size / numRows);
        for (let i = 0; i < this.size * this.size; i++) {
            let x = i % this.size;
            let y = (i / this.size) | 0;

            let sy = (y / this.size * numRows) | 0;
            let sx = (x / this.size * (sy < numWholeRows ? sectCols : (this.size % sectCols))) | 0;
            let si = sy * sectCols + sx;

            this.section[i] = si;
            this.sectionPlusDrag[i] = si;
        }

        //reset section colours
        let sqrtSizeRem = this.size % sectCols;
        for (let sym = 0; sym < this.size; sym++) {
            let divx = ((sym >= this.size - sqrtSizeRem) ? sqrtSizeRem : sectCols);
            let x = (sym % sectCols + 0.5) / divx;
            let y = (Math.floor(sym / sectCols) + 0.5) / sectRows;

            let d = lerp3(sectColEnds[0], sectColEnds[1], x);
            let u = lerp3(sectColEnds[2], sectColEnds[3], x);
            this.sectionCols[sym] = lerp3(d, u, y);
        }

        this.f = this.w / this.size;
        this.state = "adding";
    }

    clear() {
        this.resetAdditions();
        for (let i = 0; i < this.size * this.size; i++) {
            this.data[i] = 0;
            this.errorTimer[i] = 0;
        }
        for (let i = 0; i < this.size; i++) {
            this.sectionSize[i] = 0;
        }
    }

    update() {
        if (this.state === "adding") {
            for (let i = 0; i < this.size * this.size; i++) {
                this.errorTimer[i] = Math.max(0, this.errorTimer[i] - 1);
            }
        }

        this.paint();
    }

    solve() {
        //clear error timers
        for (let i = 0; i < this.size * this.size; i++) this.errorTimer[i] = 0;

        if (this.solutionGen == null) {
            this.solutionGen = solve(this.size, this.data, this.section); //see sudoku.js
        }

        let begin = new Date().getTime();
        let solution = this.solutionGen.next();
        let elapsed = new Date().getTime() - begin;
        console.log("that took " + elapsed + " milliseconds");

        if (solution.done) {
            if (this.state == "solved") this.state = "solutions_exhausted";
            else this.state = "unsolvable";
            this.solutionGen = null;
        } else {
            for (let i = 0; i < this.size * this.size; i++) {
                if (this.data[i] == 0) this.additions[i] = solution.value[i];
            }
            this.state = "solved";
        }
    }

    moveLeft() {
        this.sX = (this.sX == 0) ? this.size - 1 : this.sX - 1;
    }
    moveRight() {
        this.sX = (this.sX == this.size - 1) ? 0 : this.sX + 1;
    }
    moveUp() {
        this.sY = (this.sY == 0) ? this.size - 1 : this.sY - 1;
    }
    moveDown() {
        this.sY = (this.sY == this.size - 1) ? 0 : this.sY + 1;
    }

    mouseDown(x, y) {
        this.dsX = this.dlX = this.sX = (x / this.w * this.size) | 0;
        this.dsY = this.dlY = this.sY = (y / this.h * this.size) | 0;
        this.dragging = true;
    }

    mouseUp(x, y) {
        this.sX = (x / this.w * this.size) | 0;
        this.sY = (y / this.h * this.size) | 0;
        let cls = new Set();
        if (this.sX != this.dsX || this.sY != this.dsY) {
            //apply extension
            for (let i = 0; i < this.size * this.size; i++) {
                if (this.section[i] != this.sectionPlusDrag[i]) cls.add(this.section[i]);
                this.section[i] = this.sectionPlusDrag[i];
            }
            this.clearSections(cls);
            this.updateSections();
        }
        this.dragging = false;
    }

    mouseMove(x, y) {
        if (!this.dragging) return;

        this.sX = (x / this.w * this.size) | 0;
        this.sY = (y / this.h * this.size) | 0;

        if (this.sX != this.dlX || this.sY != this.dlY) {
            this.resetAdditions();

            //undo previous dragging fill
            let u = Math.min(this.dsY, this.dlY),
                d = Math.max(this.dsY, this.dlY);
            let l = Math.min(this.dsX, this.dlX),
                r = Math.max(this.dsX, this.dlX);
            //console.log(`mouseMove undo (${l}, ${u})-(${r}, ${d})`);
            for (let i = u; i <= d; i++) {
                for (let j = l; j <= r; j++) {
                    this.sectionPlusDrag[i * this.size + j] = this.section[i * this.size + j];
                }
            }

            //set new dragging fill
            u = Math.min(this.sY, this.dsY), d = Math.max(this.sY, this.dsY);
            l = Math.min(this.sX, this.dsX), r = Math.max(this.sX, this.dsX);
            //console.log(`mouseMove fill (${l}, ${u})-(${r}, ${d})`);
            let ds = this.section[this.dsY * this.size + this.dsX];
            for (let i = u; i <= d; i++) {
                for (let j = l; j <= r; j++) {
                    this.sectionPlusDrag[i * this.size + j] = ds;
                }
            }

            this.dlX = this.sX;
            this.dlY = this.sY;
        }
    }

    clearSections(s) {
        for (let i = 0; i < this.size * this.size; i++) {
            if (s.has(this.section[i])) {
                this.data[i] = 0;
            }
        }
    }

    setSection(sym) {
        sym -= 1; //sections are 0 based
        if (this.state == 'solved') this.state = 'adding';
        let old = this.section[this.sX + this.sY * this.size];
        if (sym == old) return;
        let i = this.sX + this.sY * this.size;
        this.section[i] = this.sectionPlusDrag[i] = sym;
        //clear both old and new sections
        this.clearSections(new Set([old, sym]));
        this.updateSections();
    }

    setCell(sym) {
        let able = true;

        let old = this.data[this.sX + this.sY * this.size];
        if (sym == old) return;

        //musn't lie on the same row or column
        for (let i = 0; i < this.size; i++) {
            if (this.data[i + this.sY * this.size] == sym) {
                able = false;
                this.errorTimer[i + this.sY * this.size] = this.errorTimerMax;
            }
            if (this.data[this.sX + i * this.size] == sym) {
                able = false;
                this.errorTimer[this.sX + i * this.size] = this.errorTimerMax;
            }
        }

        //musn't lie in the same quadrant
        let sect = this.section[this.sX + this.sY * this.size];
        for (let i = 0; i < this.size * this.size; i++) {
            if (this.section[i] == sect && this.data[i] == sym) {
                able = false;
                this.errorTimer[i] = this.errorTimerMax;
            }
        }

        if (able) {
            this.data[this.sX + this.sY * this.size] = sym;
            this.resetAdditions();
        }
    }

    clearCell() {
        this.data[this.sX + this.sY * this.size] = 0;
        this.resetAdditions();
    }
}

function numericKey(code) {
    if (code.match(/Digit[1-9]/)) return Number.parseInt(code.substr(5));
    //G for 16 is maximum
    else if (code.match(/Key[a-gA-G]/)) return Number.parseInt(code.substr(3), 17);
    else return 0;
}

function validateData(size, sections, board) {
    if (size < 2 || size > maxSize) return false;
    if (sections.length != size * size) return false;
    if (sections.length != board.length) return false;
    if (board.length < 1 || board.length > maxSize * maxSize) return false;
    for (let s of sections) {
        if (typeof s !== "number" || s != (s | 0) || s < 0 || s >= maxSize) return false;
    }
    for (let n of board) {
        if (typeof n !== "number" || n != (n | 0) || n < 0 || n > maxCellBase) return false;
    }
    return true;
}

function makeHash(sections, board) {
    //return (sections.map(s => s.toString(maxSize)).join("") +
    //    "-" + board.map(s => s.toString(maxCellBase)).join(""));
    return encode(Math.sqrt(sections.length), sections, board);
}

function parseHash(str) {
    let m = str.match(/^#?([A-Za-z0-9]+)-([A-Za-z0-9]+)$/);
    if (m) {
        let sections = m[1].split("").map(s => Number.parseInt(s, maxSize));
        let board = m[2].split("").map(s => Number.parseInt(s, maxCellBase));
        let size = Math.sqrt(sections.length) | 0;
        if (validateData(size, sections, board)) {
            return [size, sections, board];
        }
    }
    console.log(`failed to parse hash`);
    return null;
}

window.onload = () => {
    let canvas = document.getElementById("sudoku_canvas");
    let solveButton = document.getElementById("solve");
    let resetButton = document.getElementById("reset");
    let clearButton = document.getElementById("clear");
    let textButton = document.getElementById("text");
    let textOut = document.getElementById("text_out");
    let stateIndicator = document.getElementById("state_indicator");
    let sizeSlider = document.getElementById("size_slider");
    let sizeIndicator = document.getElementById("size_indicator");

    let board = new Board(canvas.getContext('2d'));

    canvas.onkeydown = (event) => {
        let key = numericKey(event.code);
        if (key > 0) {
            if (key <= board.getSize()) {
                if (event.shiftKey) {
                    board.setSection(key);
                } else {
                    board.setCell(key);
                }
            }
        } else if (event.code == "Backspace" || event.code == "Delete") board.clearCell();

        else if (event.code == "ArrowLeft") board.moveLeft();
        else if (event.code == "ArrowUp") board.moveUp();
        else if (event.code == "ArrowRight") board.moveRight();
        else if (event.code == "ArrowDown") board.moveDown();

        else if (event.key.match(/^[sS]$/)) solveButton.click();
        else if (event.key.match(/^[rR]$/)) clearButton.click();
        else if (event.key.match(/^[tT]$/)) resetButton.click();
        //board.paint();
        window.location.hash = makeHash(board.section, board.data);
        stateIndicator.innerText = board.state;
    }

    canvas.onmousedown = (event) => {
        board.mouseDown(event.pageX - canvas.offsetLeft, event.pageY - canvas.offsetTop);
        stateIndicator.innerText = board.state;
    }

    canvas.onmouseup = (event) => {
        board.mouseUp(event.pageX - canvas.offsetLeft, event.pageY - canvas.offsetTop);
        window.location.hash = makeHash(board.section, board.data);
        stateIndicator.innerText = board.state;
    }

    canvas.onmousemove = (event) => {
        board.mouseMove(event.pageX - canvas.offsetLeft, event.pageY - canvas.offsetTop);
        stateIndicator.innerText = board.state;
    }

    resetButton.onclick = () => {
        board.reset();
        canvas.focus();
        window.location.hash = makeHash(board.section, board.data);
        stateIndicator.innerText = board.state;
    }

    clearButton.onclick = () => {
        board.clear();
        canvas.focus();
        window.location.hash = makeHash(board.section, board.data);
        stateIndicator.innerText = board.state;
    }

    solveButton.onclick = () => {
        board.solve();
        canvas.focus();
        window.location.hash = makeHash(board.section, board.data);
        stateIndicator.innerText = board.state;
    }

    sizeSlider.oninput = (ev) => {
        let sz = Number.parseInt(ev.target.value);
        sizeIndicator.innerText = "" + sz;
        board.setSize(sz);
        stateIndicator.innerText = board.state;
        window.location.hash = makeHash(board.section, board.data);
    }

    textButton.onclick = () => {
        if (textOut.hidden) {
            let txt = "";
            for (let i = 0; i < board.size * board.size; i++) {
                if (i % board.size == 0 && i > 0) {
                    txt += '</br>';
                }
                if (board.data[i] > 0) txt += board.data[i].toString(maxCellBase);
                else if (board.additions[i] > 0) txt += board.additions[i].toString(maxCellBase);
                else txt += "_";
            }
            textOut.hidden = false;
            textOut.innerHTML = txt;
        } else {
            textOut.hidden = true;
        }
    }

    //e.g. DQEGBAQEBAUFBQUFBQUGBEA++++iIiZkfffRETMyH330TMzI+++iInOc0qruMRnOc1VXd4xjOc5qqu7xjGe9zVVd4xjHe97Wtbu8Y5zne61re797nOd7rW97373vc53Wtb3v3vc53uta3vfve9znHD+TJtQHmemD88lod9BQBQAMr0kBfRACQWg0HBVh4B+l0NgFCP2gC8cA
    let hash = window.location.hash;
    if (hash) {
        if (hash.charAt(0) == '#') {
            hash = hash.substr(1);
        }
        try {
            let size, section, data;
            if (window.location.hash.indexOf("-") > 0) {
                [size, section, data] = parseHash(hash)
            } else {
                [size, section, data] = decode(hash);
            }
            if (validateData(size, section, data)) {
                board.setGrid(size, section, data);
                sizeSlider.value = size;
            }
        } catch (e) {
            console.log("failed to decode hash", e);
        }
    } else {
        board.setSize(9);
    }

    textOut.hidden = true;
    stateIndicator.innerText = board.state;

    window.location.hash = makeHash(board.section, board.data);
    stateIndicator.innerText = board.state;

    canvas.focus();
    //update 10 times per second
    //TODO: paint only when necessary
    window.setInterval(() => { board.update() }, 100);

    //codingTest();
}