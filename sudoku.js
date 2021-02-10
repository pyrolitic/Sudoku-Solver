"use strict";

class Node {
    constructor(head, l, t) {
        this.left = l;
        this.right = null;
        this.up = t;
        this.down = null;

        this.header = head;
    }
}

class ColumnHead {
    constructor(id, l, type) {
        this.left = l;
        this.right = null;
        this.up = null;
        this.down = null;

        this.type = type;
        this.id = id; //either position, section or symbol
        this.size = 0; //number of nodes in this column
    }
}

class Error {
    constructor(msg) {
        this.msg = msg;
    }
}

const ROOT = Symbol("root")
const POSITION = Symbol("position");
const ROW = Symbol("row");
const COL = Symbol("col");
const SECTION = Symbol("section");

//based on Donald Knuth's Dancing Links algorithm

//terminology:
//board - sudoku board
//matrix - DLX matrix
//row, column - of the matrix, not board
//symbol - number on a tile, 1 based for input and 0 based in solver
//section - index of cell (3x3 in 9x9 sudoku), 0 based

//assumes board is valid (or blank), and not solved; returns additions as a board-wide array
//board must be either a string of 1 digit number with no spaces or an array, both of SZ*SZ elements long. 0 for blank space.
function* solve(SZ, board, sections) {
    if (board.length != SZ * SZ) throw new Error("Bad size board");
    if (sections.length != SZ * SZ) throw new Error("Bad sections map size");

    // validate sections
    let sectContents = new Array(SZ); //cells belonging to each section
    let symbolOnRow = new Array(SZ);
    let symbolOnCol = new Array(SZ);
    let symbolInSect = new Array(SZ);

    for (let q = 0; q < SZ; q++) {
        sectContents[q] = new Array();
        symbolOnRow[q] = new Set();
        symbolOnCol[q] = new Set();
        symbolInSect[q] = new Set();
    }

    for (let i = 0; i < SZ * SZ; i++) {
        let x = i % SZ;
        let y = (i / SZ) | 0;
        let n = sections[i];
        if (n < 0 || n >= SZ) {
            throw new Error(`bad section identifier: ${n}`);
        }
        sectContents[n].push([x, y]);

    }
    let anySize = sectContents[0].length;
    for (let [, con] of sectContents.entries()) {
        if (con.length != anySize) {
            throw new Error("section sizes do not match");
        }
    }

    //4 types of columns, of which there are SZ^2 columns each (packed together)
    // 1. position - constraint of one symbol per position
    // 2. symbol and column - constraint of one symbol of that value per column
    // 3. symbol and row - constraint of one symbol of that value per row
    // 4. symbol and section - constraint of one symbol of that value per section

    let cols = SZ * SZ * 4; //in the matrix

    //the root exists on the top row, to the left of the leftmost header node.
    //it has no up/down links, but otherwise is a normal header node
    let root = new ColumnHead(0, null, ROOT);

    //the top row, to the right of the root, is the header nodes, one for every column
    let header = new Array(cols);
    let h = root;

    for (let i = 0; i < cols; i++) {
        let n;
        let j = i % (SZ * SZ);
        switch ((i / (SZ * SZ)) | 0) {
            case 0:
                n = new ColumnHead(j, h, POSITION);
                break;
            case 1:
                n = new ColumnHead(j, h, ROW);
                break;
            case 2:
                n = new ColumnHead(j, h, COL);
                break;
            case 3:
                n = new ColumnHead(j, h, SECTION);
                break;
        }
        header[i] = n;
        h.right = n;
        h = n;
    }

    h.right = root;
    root.left = h;

    let ruler = new Array(cols); //contains the bottom-most nodes created
    for (let i = 0; i < cols; i++) ruler[i] = header[i];

    //sym is 0 based here
    let insert = (x, y, section, sym) => {
        //column of each node
        let pi = y * SZ + x;
        let ri = x * SZ + sym + SZ * SZ;
        let ci = y * SZ + sym + SZ * SZ * 2;
        let si = section * SZ + sym + SZ * SZ * 3;

        //create nodes and link them to each other and ruler
        let posFlag = new Node(header[pi], null, ruler[pi]);
        posFlag.up = ruler[pi];
        ruler[pi].down = posFlag;
        header[pi].size++;

        let rowFlag = new Node(header[ri], posFlag, ruler[ri]);
        rowFlag.up = ruler[ri];
        ruler[ri].down = rowFlag;
        header[ri].size++;

        let colFlag = new Node(header[ci], rowFlag, ruler[ci]);
        colFlag.up = ruler[ci];
        ruler[ci].down = colFlag;
        header[ci].size++;

        let quadFlag = new Node(header[si], colFlag, ruler[si]);
        quadFlag.up = ruler[si];
        ruler[si].down = quadFlag;
        header[si].size++;

        posFlag.left = quadFlag;
        posFlag.right = rowFlag;
        rowFlag.right = colFlag;
        colFlag.right = quadFlag;
        quadFlag.right = posFlag;

        //slide down
        ruler[pi] = posFlag;
        ruler[ri] = rowFlag;
        ruler[ci] = colFlag;
        ruler[si] = quadFlag;

        /*let str = '';
        for (let i = 0; i < SZ * SZ * 4 + 1; i++) {
            if (i % (SZ * SZ) == 0) str += '|';
            if (i == pi) str += 'p';
            else if (i == ri) str += 'r';
            else if (i == ci) str += 'c';
            else if (i == si) str += 's';
            else str += ' ';
        }
        console.log(str);*/
    };

    let rows = 0;

    //parse board and insert fixed numbers
    let fixed = new Array(SZ); //[[x, y, section id], ...]
    for (let i = 0; i < SZ; i++) fixed[i] = new Array();

    for (let y = 0; y < SZ; y++) {
        for (let x = 0; x < SZ; x++) {
            let i = x + y * SZ;
            let symbol = board[i] - 1;
            if (symbol != -1) {
                let sect = sections[i];
                insert(x, y, sect, symbol);
                symbolOnRow[symbol].add(y);
                symbolOnCol[symbol].add(x);
                symbolInSect[symbol].add(sect);
            }
        }
    }

    //generate the matrix rows, considering every possible position for each symbol,
    //ensuring that each row is in itself legal, meaning that the same number does not appear more than once
    //for each possible symbol
    for (let sym = 0; sym < SZ; sym++) {
        //for each of the SZ sections
        for (let sect = 0; sect < SZ; sect++) {
            //illegal if in the same section there is a fixed cell with the same symbol
            if (symbolInSect[sym].has(sect)) continue;

            //locally within each section
            for (let [x, y] of sectContents[sect]) {
                //cannot overlap with an existing fixed symbol
                if (board[y * SZ + x] != 0) continue;

                //illegal if on the same row or column (or on the same spot) as a fixed symbol
                if (symbolOnCol[sym].has(x) || symbolOnRow[sym].has(y)) continue;

                //if there are no collision with fixed cells, insert the new row
                insert(x, y, sect, sym);
                rows++;
            }
        }
    }

    console.log(`there are ${cols} cols and ${rows} non-fixed rows`);

    //now link all the columns at the top and bottom
    for (let i = 0; i < cols; i++) {
        header[i].up = ruler[i];
        ruler[i].down = header[i];
    }

    //a little sanity check
    for (let r = root.right.down; r != root.right; r = r.down) {
        for (let c = r.right; c != r; c = c.right) {
            let v = 1;
            for (let row = c.right; row != c; row = row.right) v++;
            if (v != 4)
                alert("v not 3");
        }
    }

    //now get solving
    let complete = new Array(SZ * SZ);
    for (let i = 0; i < SZ * SZ; i++) complete[i] = 0;

    let solutionRows = new Array(SZ * SZ); //references to rows
    //yields the same reference to complete everytime but with different contents
    yield* solveSearch(SZ, root, 0, solutionRows, complete);
}

function cover(column) {
    //remove self
    column.right.left = column.left;
    column.left.right = column.right;

    for (let r = column.down; r != column; r = r.down) {
        for (let c = r.right; c != r; c = c.right) {
            //remove each cell
            c.up.down = c.down;
            c.down.up = c.up;
            c.header.size--;
        }
    }
}

function uncover(column) {
    for (let c = column.up; c != column; c = c.up) {
        for (let r = c.left; r != c; r = r.left) {
            r.up.down = r;
            r.down.up = r;
            r.header.size++;
        }
    }

    column.right.left = column;
    column.left.right = column;
}

function* solveSearch(SZ, root, k, partial, solution) {
    if (root.right == root || root.left == root) {
        //solution found

        for (let i = 0; i < k; i++) {
            let n = partial[i];

            //get the symbol flag
            while (n.header.type != SECTION) n = n.left;
            let sym = n.header.id % SZ + 1;
            n = n.right;

            //n should now be the position flag
            solution[n.header.id] = sym;
        }

        yield solution;
    } else {
        // pick the column with the fewest nodes uncovered
        let col = root.right;
        for (let c = root.right; c != root; c = c.right) {
            if (c.size < col.size) col = c;
        }

        cover(col);

        for (let row = col.down; row != col; row = row.down) {
            partial[k] = row;

            for (let n = row.right; n != row; n = n.right)
                cover(n.header);

            yield* solveSearch(SZ, root, k + 1, partial, solution);

            for (let n = row.left; n != row; n = n.left)
                uncover(n.header);
        }

        uncover(col);
    }
}