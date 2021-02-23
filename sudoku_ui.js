"use strict";

class UIElems {
    constructor() {
        /**
         * @type {HTMLCanvasElement}
         */
        this.canvas = null;
        /**
         * @type {HTMLButtonElement}
         */
        this.undoButton = null;
        /**
         * @type {HTMLButtonElement}
         */
        this.redoButton = null;
        /**
         * @type {HTMLButtonElement}
         */
        this.solveButton = null;
        /**
         * @type {HTMLButtonElement}
         */
        this.resetButton = null;
        /**
         * @type {HTMLButtonElement}
         */
        this.clearButton = null;
        /**
         * @type {HTMLButtonElement}
         */
        this.textButton = null;
        /**
         * @type {HTMLLabelElement}
         */
        this.textOut = null;
        /**
         * @type {HTMLLabelElement}
         */
        this.stateIndicator = null;
        /**
         * @type {HTMLInputElement}
         */
        this.sizeSlider = null;
        /**
         * @type {HTMLLabelElement}
         */
        this.sizeIndicator = null;
        /**
         * @type {HTMLDivElement}
         */
        this.symButtonFrame = null;
    }
}
let uiElems = new UIElems();

/**
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @param {number} max
 */
function lerp(a, b, x, max) {
    return (max - x) * a + b * x;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number[][]} cs
 */
function terp3(a, b, cs) {
    let c = 1 - a - b;
    return [
        (a * cs[0][0] + b * cs[1][0] + c * cs[2][0]) | 0,
        (a * cs[0][1] + b * cs[1][1] + c * cs[2][1]) | 0,
        (a * cs[0][2] + b * cs[1][2] + c * cs[2][2]) | 0
    ];
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} x
 */
function lerp3(a, b, x) {
    return [
        (a[0] * (1 - x) + b[0] * x) | 0,
        (a[1] * (1 - x) + b[1] * x) | 0,
        (a[2] * (1 - x) + b[2] * x) | 0
    ];
}

/**
 * @param {number} h - 0..1
 * @param {number} s - 0..1
 * @param {number} l - 0..1
 */
function HSV2RGB(h, s, l) {
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let hh = h / 60;
    let x = c * (1 - Math.abs(hh % 2 - 1));
    let m = l - c / 2;
    switch (hh | 0) {
        case 0:
            return [((c + m) * 256) | 0, ((x + m) * 256) | 0, ((0 + m) * 256) | 0];
        case 1:
            return [((x + m) * 256) | 0, ((c + m) * 256) | 0, ((0 + m) * 256) | 0];
        case 2:
            return [((0 + m) * 256) | 0, ((c + m) * 256) | 0, ((x + m) * 256) | 0];
        case 3:
            return [((0 + m) * 256) | 0, ((x + m) * 256) | 0, ((c + m) * 256) | 0];
        case 4:
            return [((x + m) * 256) | 0, ((0 + m) * 256) | 0, ((c + m) * 256) | 0];
        case 5:
            return [((c + m) * 256) | 0, ((0 + m) * 256) | 0, ((x + m) * 256) | 0];
        default:
            return [m, m, m];
    }
}

const sectColEnds = [
    [0x98, 0xda, 0x1f], //left
    [0xd6, 0x28, 0x28], //right
    [0xe9, 0xc4, 0x6a], //up
    [0x2a, 0x9d, 0x8f] //down
];

const NormalCol = "rgb(250, 250, 250)";
const ErrorCol = "rgb(255, 60, 60)";
const FixedCol = "rgb(50, 50, 50)";
const CompletedCol = "rgb(80, 120, 190)";

const ErrorTimerMax = 5;
const Margin = 3;

const maxSize = 16;
const MaxCellBase = maxSize + 1;

/**
 * @param {number} len
 */
function zfill(len) {
    let ar = new Array(len);
    for (let i = 0; i < len; i++) {
        ar[i] = 0;
    }
    return ar;
}

const Summary = Object.freeze({
    Editing: Symbol("Editing"),
    SolutionCycle: Symbol("SolutionCycle"),
    SolutionsDone: Symbol("SolutionsDone"),
    Unsolvable: Symbol("Unsolvable"),
});

class State {
    /**
     * @param {symbol} summary
     * @param {number} size
     * @param {number[]} section
     * @param {number[]} board
     * @param {number[]} additions
     * @param {number} sX
     * @param {number} sY
     */
    constructor(summary, size, section, board, additions, sX, sY) {
        this.summary = summary;
        this.size = size;
        this.section = section;
        //values filled in (1 based, 0 means not filled in)
        this.board = board;
        //solution
        this.additions = additions;
        //selection
        this.selectorX = sX;
        this.selectorY = sY;

    }
    clone() {
        return new State(
            this.summary, this.size, [...this.section], [...this.board], [...this.additions],
            this.selectorX, this.selectorY
        );
    }
}

const DeltaType = Object.freeze({
    SizeChange: Symbol("SizeChange"),
    SelectorMove: Symbol("SelectorMove"),
    BoardChange: Symbol("BoardChange"), //also section change
    SolutionCycle: Symbol("SolveStart")
});

class Delta {
    /**
     * @param {Symbol} type
     */
    constructor(type) {
        this.type = type;
        this.prevState = null;
    }

    /**
     * @param {State} state
     */
    apply(state) {
        throw "pure virtual";
    }

    /**
     * @param {State} state
     */
    undo(state) {
        throw "pure virtual";
    }
}

/**
 * @param {number} size
 */
function makeSections(size) {
    let section = new Array(size ** 2);
    //create some sections, can't guarantee they're all the same size
    //this will only properly work when size is a power of 2 so it can be split into an even grid
    let sectCols = Math.ceil(Math.sqrt(size));
    let numWholeRows = (size / sectCols) | 0;
    let numRows = numWholeRows + ((size % sectCols == 0) ? 0 : 1);

    for (let i = 0; i < size ** 2; i++) {
        let x = i % size;
        let y = (i / size) | 0;

        let sy = (y / size * numRows) | 0;
        let sx = (x / size * (sy < numWholeRows ? sectCols : (size % sectCols))) | 0;
        let si = sy * sectCols + sx;

        section[i] = si;
    }

    return section;
}

/**
 * @param {number} size
 
function makeSectionCols(size) {
    let sectionCols = new Array(size);
    let sectCols = Math.ceil(Math.sqrt(size));
    let numWholeRows = (size / sectCols) | 0;
    let numRows = numWholeRows + ((size % sectCols == 0) ? 0 : 1);
    let sectRows = Math.floor(size / numRows);
    let sqrtSizeRem = size % sectCols;
    for (let sym = 0; sym < size; sym++) {
        let divx = ((sym >= size - sqrtSizeRem) ? sqrtSizeRem : sectCols);
        let x = (sym % sectCols + 0.5) / divx;
        let y = (Math.floor(sym / sectCols) + 0.5) / sectRows;

        let d = lerp3(sectColEnds[0], sectColEnds[1], x);
        let u = lerp3(sectColEnds[2], sectColEnds[3], x);
        sectionCols[sym] = lerp3(d, u, y);
    }
    return sectionCols;
}*/

/**
 * @param {number} size
 * @param {number[]} section
 * @param {number[]} board
 * @param {Set<number>} clearSet
 */
function clearBoardOnSections(size, section, board, clearSet) {
    for (let i = 0; i < size ** 2; i++) {
        if (clearSet.has(section[i])) {
            board[i] = 0;
        }
    }
}

/**
 * @param {number} size
 * @param {number[]} section
 * @param {number[]} board
 * @param {number} sX
 * @param {number} sY
 * @param {number} newSym
 */
function changeErrors(size, section, board, sX, sY, newSym) {
    let err = new Set();
    if (newSym == 0) {
        // deleting a symbol can't fail
        return err;
    }

    //musn't lie on the same row or column
    for (let i = 0; i < size; i++) {
        if (board[i + sY * size] == newSym) {
            err.add(i + sY * size);
        }
        if (board[sX + i * size] == newSym) {
            err.add(sX + i * size);
        }
    }

    //musn't lie in the same quadrant
    let sect = section[sX + sY * size];
    for (let i = 0; i < size ** 2; i++) {
        if (section[i] == sect && board[i] == newSym) {
            err.add(i);
        }
    }

    return err;
}

/**
 * @param {number} size
 * @param {number[]} section
 */
function sectionsEvenlySplit(size, section) {
    let freq = new Map();
    count(freq, section);
    for (let [, s] of freq.entries()) {
        if (s != size) return false;
    }
    return true;
}

class SizeChange extends Delta {
    /**
     * @param {number} toSize
     */
    constructor(toSize) {
        super(DeltaType.SizeChange);
        this.toSize = toSize;
        this.oldState = null;
    }

    /**
     * @param {State} state
     */
    apply(state) {
        this.oldState = state.clone();
        state.summary = Summary.Editing;
        state.size = this.toSize;
        state.section = makeSections(this.toSize);
        state.board = zfill(this.toSize * this.toSize);
        state.additions = zfill(this.toSize * this.toSize);
        state.selectorX = Math.min(state.selectorX, this.toSize - 1);
        state.selectorY = Math.min(state.selectorY, this.toSize - 1);
    }

    /**
     * @param {State} state
     */
    undo(state) {
        state.summary = this.oldState.summary;
        state.size = this.oldState.size;
        state.section = this.oldState.section;
        state.board = this.oldState.board;
        state.additions = this.oldState.additions;
        state.selectorX = this.oldState.selectorX;
        state.selectorY = this.oldState.selectorY;
    }
}

class SelectorMove extends Delta {
    /**
     * @param {number} nX
     * @param {number} nY
     */
    constructor(nX, nY) {
        super(DeltaType.SelectorMove);
        this.nX = nX;
        this.nY = nY;
        this.pX = 0;
        this.pY = 0;
    }

    /**
     * @param {State} state
     */
    apply(state) {
        this.pX = state.selectorX;
        this.pY = state.selectorY;
        state.selectorX = this.nX;
        state.selectorY = this.nY;
    }

    /**
     * @param {State} state
     */
    undo(state) {
        state.selectorX = this.pX;
        state.selectorY = this.pY;
    }
}

class BoardChange extends Delta {
    /**
     * @param {number[]} toSections
     * @param {number[]} toBoard
     */
    constructor(toSections, toBoard) {
        super(DeltaType.BoardChange);
        this.toSections = toSections;
        this.toBoard = toBoard;
        this.oldSummary = null;
        this.oldSections = null;
        this.oldBoard = null;
    }

    /**
     * @param {State} state
     */
    apply(state) {
        this.oldSummary = state.summary;
        this.oldSections = state.section;
        this.oldBoard = state.board;
        state.summary = Summary.Editing;
        state.section = this.toSections;
        state.board = this.toBoard;
    }

    /**
     * @param {State} state
     */
    undo(state) {
        state.summary = this.oldSummary;
        state.section = this.oldSections;
        state.board = this.oldBoard;
    }
}

class SolutionCycleChange extends Delta {
    /**
     * @param {number[]} additions
     * @param {symbol} toSummary
     */
    constructor(additions, toSummary) {
        super(DeltaType.SolutionCycle);
        this.toAdditions = additions;
        this.toSummary = toSummary;
        this.oldAdditions = null;
        this.oldSummary = null;
    }

    /**
     * @param {State} state
     */
    apply(state) {
        this.oldSummary = state.summary;
        this.oldAdditions = state.additions;
        state.additions = this.toAdditions;
        state.summary = this.toSummary;
    }

    /**
     * @param {State} state
     */
    undo(state) {
        state.additions = this.oldAdditions;
        state.summary = this.oldSummary;
    }
}

class Board {
    /**
     * @param {State} initState
     * @param {CanvasRenderingContext2D} canvasContext
     */
    constructor(initState, canvasContext) {
        this.state = initState;
        this.errorTimer = new Map(); //x+y*size => seconds remaining

        // drag start
        this.dragging = false;
        this.dragStartTime = 0;
        this.dragStartX = 0;
        this.dragStartY = 0;
        // drag last cell
        this.dlX = 0;
        this.dlY = 0;

        // drawing
        this.sectionCols = null;
        this.sectionAltCols = null;
        this.sectionPlusDrag = [...this.state.section]; //for drawing enlarged sections while dragging
        this.context = canvasContext;
        this.w = 500;
        this.h = 500;
        this.forceUpdate = false;
        this.summaryOverride = null;

        // solution generator
        this.solutionGen = null;
        this.solutionGenAtChange = -1;

        // undo/redo
        this.changes = [];
        this.afterChange = 0;

        this.updateCols();
        this.updateView();
    }

    updateCols() {
        this.sectionCols = new Array(this.state.size);
        this.sectionAltCols = new Array(this.state.size);

        for (let i = 0; i < this.state.size; i++) {
            let h = (i + 0.5) * 360 / this.state.size;
            let rh = (h + 180) % 360;
            this.sectionCols[i] = HSV2RGB(h, 0.5, 0.7);
            this.sectionAltCols[i] = HSV2RGB(rh, 0.8, 0.3);
        }
    }

    updateView() {
        this.sectionPlusDrag = [...this.state.section];
        this.errorTimer.clear();
        this.forceUpdate = true;
        window.location.hash = encodeHash(this.state.size, this.state.section, this.state.board);
        uiElems.sizeSlider.value = "" + this.state.size;
        uiElems.sizeIndicator.innerHTML = "" + this.state.size;
        let summary = (this.summaryOverride ? this.summaryOverride : this.state.summary);
        uiElems.stateIndicator.innerText = summary.toString().match(/Symbol\((.*)\)/)[1];
        uiElems.undoButton.disabled = this.afterChange == 0;
        uiElems.redoButton.disabled = this.afterChange == this.changes.length;
        uiElems.solveButton.disabled = !sectionsEvenlySplit(this.state.size, this.state.section);
        uiElems.textOut.innerHTML = this.generateText();
        let sym = 0;
        for (let button of uiElems.symButtonFrame.children) {
            // @ts-ignore
            button.hidden = (sym > this.state.size ||
                sym == this.state.board[this.state.selectorX + this.state.selectorY * this.state.size] ||
                changeErrors(this.state.size, this.state.section, this.state.board,
                    this.state.selectorX, this.state.selectorY, sym).size > 0);
            sym++;
        }
    }

    /**
     * @param {Delta} change
     */
    makeChange(change) {
        let oldSize = this.state.size;
        //clear future changes, if any
        this.changes.splice(this.afterChange);
        //start new timeline
        change.apply(this.state);
        if (this.state.size != oldSize) this.updateCols();
        this.changes.push(change);
        this.afterChange++;
        this.summaryOverride = null;
        if (change.type != DeltaType.SolutionCycle) this.solutionGen = null;
        this.updateView();
    }

    /**
     * @param {boolean} eraseFuture
     */
    undoChange(eraseFuture) {
        if (this.afterChange == 0) return;
        let oldSize = this.state.size;
        this.afterChange--;
        this.changes[this.afterChange].undo(this.state);
        if (this.state.size != oldSize) this.updateCols();
        this.summaryOverride = null;
        this.solutionGen = null;
        this.updateView();
        if (eraseFuture) this.changes.splice(this.afterChange);
    }

    redoChange() {
        if (this.afterChange == this.changes.length) return;
        let oldSize = this.state.size;
        this.changes[this.afterChange].apply(this.state);
        if (this.state.size != oldSize) this.updateCols();
        this.afterChange++;
        this.summaryOverride = null;
        this.updateView();
    }

    /**
     * @param {number} x
     */
    errorColStage(x) {
        /*let r;
        if (x > ErrorTimerMax - 4) r = lerp(200, 255, x - ErrorTimerMax, 4);
        else r = lerp(255, 70, x - ErrorTimerMax - 4, ErrorTimerMax - 4);*/

        let r = (x * 255) / ErrorTimerMax + 150;
        return "rgb(" + Math.floor(r) + ", " + 70 + ", " + 70 + ")";
    }

    paint() {
        this.context.clearRect(0, 0, this.w, this.h);
        let cellSize = (this.w - 2 * Margin) / this.state.size;

        this.context.translate(Margin, Margin);

        //first the sectors
        for (let i = 0; i < this.state.size; i++) {
            for (let j = 0; j < this.state.size; j++) {
                let s = this.sectionPlusDrag[i * this.state.size + j];
                let c = this.sectionCols[s];
                this.context.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
                this.context.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
            }
        }

        //the selection highlighter
        //this.context.globalCompositeOperation = "lighter";
        let selSect = this.sectionPlusDrag[this.state.selectorY * this.state.size + this.state.selectorX];
        let selCol = this.sectionAltCols[selSect];
        this.context.strokeStyle = "rgb(" + (selCol[0]) + "," + (selCol[1]) + "," + (selCol[2]) + ")";
        //this.context.strokeStyle = "rgb(40, 40, 40)";
        this.context.lineWidth = 3;
        this.context.beginPath();
        let selMargin = 3;
        this.context.moveTo((this.state.selectorX + 0) * cellSize + selMargin, (this.state.selectorY + 0) * cellSize + selMargin);
        this.context.lineTo((this.state.selectorX + 1) * cellSize - selMargin, (this.state.selectorY + 0) * cellSize + selMargin);
        this.context.lineTo((this.state.selectorX + 1) * cellSize - selMargin, (this.state.selectorY + 1) * cellSize - selMargin);
        this.context.lineTo((this.state.selectorX + 0) * cellSize + selMargin, (this.state.selectorY + 1) * cellSize - selMargin);
        this.context.lineTo((this.state.selectorX + 0) * cellSize + selMargin, (this.state.selectorY + 0) * cellSize + selMargin);

        /*this.context.beginPath();
        let d = 2;
        for (; d < cellSize; d += 12) {
            this.context.moveTo(this.state.selectorX * cellSize + d, this.state.selectorY * cellSize);
            this.context.lineTo(this.state.selectorX * cellSize, this.state.selectorY * cellSize + d);

            this.context.moveTo((this.state.selectorX + 1) * cellSize - d, this.state.selectorY * cellSize);
            this.context.lineTo((this.state.selectorX + 1) * cellSize, this.state.selectorY * cellSize + d);
        }
        for (; d < 2 * cellSize; d += 12) {
            let over = d - cellSize;
            this.context.moveTo((this.state.selectorX + 1) * cellSize, this.state.selectorY * cellSize + over);
            this.context.lineTo(this.state.selectorX * cellSize + over, (this.state.selectorY + 1) * cellSize);

            this.context.moveTo(this.state.selectorX * cellSize, this.state.selectorY * cellSize + over);
            this.context.lineTo((this.state.selectorX + 1) * cellSize - over, (this.state.selectorY + 1) * cellSize);
        }*/

        this.context.closePath();
        this.context.stroke();

        //the section borders
        this.context.strokeStyle = "rgba(0, 0, 0, 255)";
        this.context.lineWidth = 5;
        for (let i = -1; i < this.state.size; i++) {
            for (let j = -1; j < this.state.size; j++) {
                let s00 = (i >= 0 && j >= 0) ? this.sectionPlusDrag[i * this.state.size + j] : -2;
                //vertical against cell to the right
                if (j == this.state.size - 1 || s00 != this.sectionPlusDrag[i * this.state.size + j + 1]) {
                    this.context.beginPath();
                    this.context.moveTo((j + 1) * cellSize, i * cellSize);
                    this.context.lineTo((j + 1) * cellSize, (i + 1) * cellSize);
                    this.context.closePath();
                    this.context.stroke();
                }
                //horizontal against cell below
                if (i == this.state.size - 1 || s00 != this.sectionPlusDrag[(i + 1) * this.state.size + j]) {
                    this.context.beginPath();
                    this.context.moveTo((j) * cellSize, (i + 1) * cellSize);
                    this.context.lineTo((j + 1) * cellSize, (i + 1) * cellSize);
                    this.context.closePath();
                    this.context.stroke();
                }
            }
        }

        //then the grid
        this.context.strokeStyle = "rgba(0, 0, 0, 255)";
        /*this.context.lineWidth = 5;
        this.context.beginPath();
        this.context.moveTo(0, 0);
        this.context.lineTo(this.w, 0);
        this.context.lineTo(this.w, this.h);
        this.context.lineTo(0, this.h);
        this.context.lineTo(0, 0);
        this.context.closePath();
        this.context.stroke();*/

        this.context.lineWidth = 1;
        this.context.beginPath();
        for (let i = 0; i <= this.state.size; i++) {
            this.context.moveTo(i * cellSize, 0);
            this.context.lineTo(i * cellSize, this.h);

            this.context.moveTo(0, i * cellSize);
            this.context.lineTo(this.w, i * cellSize);
        }
        this.context.closePath();
        this.context.stroke();

        //now the numbers
        this.context.strokeStyle = "rgba(0, 0, 0, 255)";
        this.context.font = ((45 * 9 / this.state.size) | 0) + "pt Helvetica";
        for (let j = 0; j < this.state.size; j++) {
            for (let i = 0; i < this.state.size; i++) {
                let sym = this.state.board[i + j * this.state.size];
                if (this.state.summary === Summary.SolutionCycle) {
                    if (sym == 0) {
                        sym = this.state.additions[i + j * this.state.size];
                        this.context.fillStyle = CompletedCol;
                    } else {
                        this.context.fillStyle = FixedCol;
                    }
                } else {
                    let p = i + j * this.state.size;
                    if (this.errorTimer.has(p)) {
                        let er = this.errorTimer.get(p);
                        this.context.fillStyle = this.errorColStage(er);
                    } else {
                        this.context.fillStyle = NormalCol;
                    }
                }

                if (sym != 0) {
                    let x = i * cellSize + 12 * 9 / this.state.size;
                    let y = (j + 1) * cellSize - 7 * 9 / this.state.size;
                    let str = sym.toString(this.state.size + 1);
                    this.context.fillText(str, x, y);
                    this.context.lineWidth = 1.2;
                    this.context.strokeText(str, x, y);
                }
            }
        }

        this.context.resetTransform();
    }

    getSize() {
        return this.state.size;
    }

    /**
     * @param {number} sz
     */
    setSize(sz) {
        if (sz < 1) sz = 1;
        this.makeChange(new SizeChange(sz));
    }

    clear() {
        if (!this.state.board.every(s => s == 0)) {
            this.makeChange(new BoardChange(this.state.section, zfill(this.state.size ** 2)));
        }
    }

    update() {
        let update = this.forceUpdate;
        this.forceUpdate = false;
        if (this.state.summary == Summary.Editing) {
            for (let [k, t] of this.errorTimer.entries()) {
                if (t < 1) this.errorTimer.delete(k);
                else this.errorTimer.set(k, t - 1);
                update = true;
            }
        }
        if (update) {
            this.paint();
        }
    }

    solve() {
        if (this.solutionGen == null) {
            this.solutionGen = generateSolutions(this.state.size, this.state.board, this.state.section); //see sudoku.js
        }

        let begin = Date.now();
        let solution = this.solutionGen.next();
        let elapsed = Date.now() - begin;
        console.log("solution took " + elapsed + " milliseconds");

        if (solution.done) {
            if (this.state.summary == Summary.SolutionCycle) {
                // go back to last editing change and erase the future
                this.undoChange(true);
                this.summaryOverride = Summary.SolutionsDone;
            } else {
                this.summaryOverride = Summary.Unsolvable;
            }
            this.solutionGen = null;
            this.updateView();
        } else {
            if (this.state.summary == Summary.SolutionCycle) {
                for (let i = 0; i < this.state.size ** 2; i++) {
                    if (this.state.board[i] == 0) this.state.additions[i] = solution.value[i];
                }
                this.updateView();
            } else {
                let additions = zfill(this.state.size ** 2);
                for (let i = 0; i < this.state.size ** 2; i++) {
                    if (this.state.board[i] == 0) additions[i] = solution.value[i];
                }
                this.makeChange(new SolutionCycleChange(additions, Summary.SolutionCycle));
            }
        }
    }

    /**
     * @param {number} dX
     * @param {number} dY
     */
    moveSelector(dX, dY) {
        let nX = (this.state.selectorX + dX + this.state.size) % this.state.size;
        let nY = (this.state.selectorY + dY + this.state.size) % this.state.size;
        this.makeChange(new SelectorMove(nX, nY));
    }

    /**
     * @param {number} canvasX
     * @param {number} canvasY
     */
    isOnCell(canvasX, canvasY) {
        return canvasX >= Margin && canvasX < this.w - Margin && canvasY >= Margin && canvasY < this.h - Margin;
    }

    /**
     * @param {number} canvasX
     * @param {number} canvasY
     * @returns {[number, number]}
     */
    cellAt(canvasX, canvasY) {
        canvasX -= Margin;
        canvasY -= Margin;
        let w = this.w - 2 * Margin;
        let h = this.h - 2 * Margin;
        if (canvasX >= 0 && canvasX < w && canvasY >= 0 && canvasY < h) {
            let sX = (canvasX / w * this.state.size) | 0;
            let sY = (canvasY / h * this.state.size) | 0;
            return [sX, sY];
        } else {
            return [-1, -1];
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    mouseDown(x, y) {
        if (this.isOnCell(x, y)) {
            let [sX, sY] = this.cellAt(x, y);
            this.dragStartX = this.dlX = sX;
            this.dragStartY = this.dlY = sY;
            this.dragStartTime = Date.now();
            this.dragging = true;
            //don't make any state changes until the mouseUp
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    mouseUp(x, y) {
        if (this.isOnCell(x, y)) {
            let [sX, sY] = this.cellAt(x, y);

            if (sX == this.dragStartX && sY == this.dragStartY) {
                //plain click
                if (sX != this.state.selectorX || sY != this.state.selectorY) {
                    this.makeChange(new SelectorMove(sX, sY));
                }
            } else {
                //drag end
                let newSections = [...this.sectionPlusDrag];
                let newBoard = [...this.state.board];
                let cls = new Set([this.state.section[this.dragStartX + this.dragStartY * this.state.size]]);
                for (let i = 0; i < this.state.size ** 2; i++) {
                    if (this.state.section[i] != this.sectionPlusDrag[i]) {
                        cls.add(this.state.section[i]);
                    }
                }
                if (cls.size > 0) {
                    clearBoardOnSections(this.state.size, newSections, newBoard, cls);
                    this.makeChange(new BoardChange(newSections, newBoard));
                }
            }
        }
        this.dragging = false;
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    mouseMove(x, y) {
        if (!this.dragging) return;

        if (this.isOnCell(x, y)) {
            let [sX, sY] = this.cellAt(x, y);

            if (sX != this.dlX || sY != this.dlY) {
                //undo previous dragging fill
                let u = Math.min(this.dragStartY, this.dlY),
                    d = Math.max(this.dragStartY, this.dlY);
                let l = Math.min(this.dragStartX, this.dlX),
                    r = Math.max(this.dragStartX, this.dlX);
                //console.log(`mouseMove undo (${l}, ${u})-(${r}, ${d})`);
                for (let i = u; i <= d; i++) {
                    for (let j = l; j <= r; j++) {
                        this.sectionPlusDrag[i * this.state.size + j] = this.state.section[i * this.state.size + j];
                    }
                }

                //set new dragging fill
                u = Math.min(sY, this.dragStartY), d = Math.max(sY, this.dragStartY);
                l = Math.min(sX, this.dragStartX), r = Math.max(sX, this.dragStartX);
                //console.log(`mouseMove fill (${l}, ${u})-(${r}, ${d})`);
                let ds = this.state.section[this.dragStartY * this.state.size + this.dragStartX];
                for (let i = u; i <= d; i++) {
                    for (let j = l; j <= r; j++) {
                        this.sectionPlusDrag[i * this.state.size + j] = ds;
                    }
                }

                this.dlX = sX;
                this.dlY = sY;
                this.forceUpdate = true;
            }
        }
    }

    /**
     * @param {number} sym
     */
    setSection(sym) {
        sym -= 1; //sections are 0 based
        let old = this.state.section[this.state.selectorX + this.state.selectorY * this.state.size];
        if (sym != old) {
            let newSections = [...this.state.section];
            let newBoard = [...this.state.board];
            let i = this.state.selectorX + this.state.selectorY * this.state.size;
            newSections[i] = this.sectionPlusDrag[i] = sym;
            clearBoardOnSections(this.state.size, newSections, newBoard, new Set([sym]));
            this.makeChange(new BoardChange(newSections, newBoard))
        }
    }

    /**
     * @param {number} sym
     */
    setCell(sym) {
        let old = this.state.board[this.state.selectorX + this.state.selectorY * this.state.size];
        if (sym == old) return;

        let errs = changeErrors(this.state.size, this.state.section, this.state.board, this.state.selectorX, this.state.selectorY, sym);
        if (errs.size > 0) {
            for (let i of errs) {
                this.errorTimer.set(i, ErrorTimerMax);
            }
        } else {
            let newSections = [...this.state.section];
            let newBoard = [...this.state.board];
            newBoard[this.state.selectorX + this.state.selectorY * this.state.size] = sym;
            this.makeChange(new BoardChange(newSections, newBoard));
        }
    }

    clearCell() {
        this.setCell(0);
    }

    generateText() {
        let txt = "";
        for (let i = 0; i < this.state.size ** 2; i++) {
            if (i % this.state.size == 0 && i > 0) {
                txt += '</br>';
            }
            if (this.state.board[i] > 0) txt += this.state.board[i].toString(MaxCellBase);
            else if (this.state.additions && this.state.additions[i] > 0) txt += this.state.additions[i].toString(MaxCellBase);
            else txt += "_";
        }
        return txt;
    }
}

/**
 * @param {string} code
 */
function numericKey(code) {
    if (code.match(/Digit[1-9]/)) return Number.parseInt(code.substr(5));
    //G for 16 is maximum
    else if (code.match(/Key[a-gA-G]/)) return Number.parseInt(code.substr(3), 17);
    else return 0;
}

/**
 * @param {number} size
 * @param {number[]} sections
 * @param {number[]} board
 */
function validateData(size, sections, board) {
    if (size < 2 || size > maxSize) return false;
    if (sections.length != size ** 2) return false;
    if (sections.length != board.length) return false;
    if (board.length < 1 || board.length > maxSize * maxSize) return false;
    for (let s of sections) {
        if (typeof s !== "number" || s != (s | 0) || s < 0 || s >= maxSize) return false;
    }
    for (let n of board) {
        if (typeof n !== "number" || n != (n | 0) || n < 0 || n > MaxCellBase) return false;
    }
    return true;
}

window.onload = () => {
    // @ts-ignore
    uiElems.canvas = document.getElementById("sudoku_canvas");
    // @ts-ignore
    uiElems.undoButton = document.getElementById("undo");
    // @ts-ignore
    uiElems.redoButton = document.getElementById("redo");
    // @ts-ignore
    uiElems.solveButton = document.getElementById("solve");
    // @ts-ignore
    uiElems.resetButton = document.getElementById("reset");
    // @ts-ignore
    uiElems.clearButton = document.getElementById("clear");
    // @ts-ignore
    uiElems.textButton = document.getElementById("text");
    // @ts-ignore
    uiElems.textOut = document.getElementById("text_out");
    // @ts-ignore
    uiElems.stateIndicator = document.getElementById("state_indicator");
    // @ts-ignore
    uiElems.sizeSlider = document.getElementById("size_slider");
    // @ts-ignore
    uiElems.sizeIndicator = document.getElementById("size_indicator");
    // @ts-ignore
    uiElems.symButtonFrame = document.getElementById("sym_button_frame");

    let size, section, boardData;
    //e.g. DQEGBAQEBAUFBQUFBQUGBEA++++iIiZkfffRETMyH330TMzI+++iInOc0qruMRnOc1VXd4xjOc5qqu7xjGe9zVVd4xjHe97Wtbu8Y5zne61re797nOd7rW97373vc53Wtb3v3vc53uta3vfve9znHD+TJtQHmemD88lod9BQBQAMr0kBfRACQWg0HBVh4B+l0NgFCP2gC8cA
    let hash = window.location.hash;
    if (hash) {
        if (hash.charAt(0) == '#') {
            hash = hash.substr(1);
        }
        try {
            if (window.location.hash.indexOf("-") > 0) {
                [size, section, boardData] = oldDecodeHash(hash);
            } else {
                [size, section, boardData] = decodeHash(hash);
            }
            if (!validateData(size, section, boardData)) {
                size = undefined;
                throw "decoded hash but data is not valid";
            }
        } catch (e) {
            console.log("failed to decode hash", e);
        }
    }

    if (!size) {
        size = 9;
        section = makeSections(size);
        boardData = zfill(size ** 2);
    }

    let initState = new State(Summary.Editing, size, section, boardData, zfill(size ** 2), 0, 0);
    let board = new Board(initState, uiElems.canvas.getContext("2d"));
    board.updateView();


    for (let sym = 0; sym < MaxCellBase; sym++) {
        let button = document.createElement("button");
        button.innerText = (sym == 0) ? "Clear" : sym.toString(MaxCellBase);
        button.hidden = true;
        button.onclick = () => {
            board.setCell(sym);
        }
        uiElems.symButtonFrame.appendChild(button);
    }

    /**
     * @param {KeyboardEvent} event
     */
    window.onkeydown = (event) => {
        let key = numericKey(event.code);
        if (key > 0) {
            if (key <= board.getSize()) {
                if (event.shiftKey) {
                    board.setSection(key);
                } else {
                    board.setCell(key);
                }
            }
        } else if (event.code == "Backspace" || event.code == "Delete") board.setCell(0); //clear cell

        else if (event.code == "ArrowLeft") board.moveSelector(-1, 0);
        else if (event.code == "ArrowUp") board.moveSelector(0, -1);
        else if (event.code == "ArrowRight") board.moveSelector(1, 0);
        else if (event.code == "ArrowDown") board.moveSelector(0, 1);

        else if (event.key.match(/^[sS]$/)) uiElems.solveButton.click();
        //else if (event.key.match(/^[rR]$/)) uiElems.clearButton.click();
        //else if (event.key.match(/^[tT]$/)) uiElems.resetButton.click();

        else if (event.key.match(/^[zZ]$/) && !event.shiftKey && event.ctrlKey) uiElems.undoButton.click();
        else if (event.key.match(/^[zZ]$/) && event.shiftKey && event.ctrlKey) uiElems.redoButton.click();
    }

    // input handling
    uiElems.canvas.onmousedown = (event) => {
        board.mouseDown(event.pageX - uiElems.canvas.offsetLeft, event.pageY - uiElems.canvas.offsetTop);
    }
    uiElems.canvas.onmouseup = (event) => {
        board.mouseUp(event.pageX - uiElems.canvas.offsetLeft, event.pageY - uiElems.canvas.offsetTop);
    }

    // in case of dragging outside the canvas and lifting the mouse button, prevent dragging from "sticking"
    window.onmouseup = (event) => {
        board.mouseUp(0, 0);
    }
    uiElems.canvas.onmousemove = (event) => {
        board.mouseMove(event.pageX - uiElems.canvas.offsetLeft, event.pageY - uiElems.canvas.offsetTop);
    }

    uiElems.sizeSlider.oninput = (ev) => {
        // @ts-ignore
        let sz = Number.parseInt(ev.target.value, 10);
        board.setSize(sz);
    }
    uiElems.sizeSlider.onmouseup = () => {
        uiElems.canvas.focus();
    }
    uiElems.undoButton.onclick = () => {
        board.undoChange(false);
        uiElems.canvas.focus();
    }
    uiElems.redoButton.onclick = () => {
        board.redoChange();
        uiElems.canvas.focus();
    }
    uiElems.resetButton.onclick = () => {
        //reset sections and board
        board.setSize(board.state.size);
        uiElems.canvas.focus();
    }
    uiElems.clearButton.onclick = () => {
        //reset board only
        board.clear();
        uiElems.canvas.focus();
    }
    uiElems.solveButton.onclick = () => {
        board.solve();
        uiElems.canvas.focus();
    }
    uiElems.textButton.onclick = () => {
        uiElems.textOut.hidden = !uiElems.textOut.hidden;
    }
    uiElems.textOut.hidden = true;

    uiElems.canvas.focus();
    //update 10 times per second
    //TODO: paint only when necessary
    window.setInterval(() => { board.update() }, 100);

    //codingTest();
}