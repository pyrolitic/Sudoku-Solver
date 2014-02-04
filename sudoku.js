'use strict';

function Node(head, l, t){
	this.left = l;
	this.right = null;
	this.up = t;
	this.down = null;

	this.header = head;
}

function HeaderNode(id, l, type){
	this.left = l;
	this.right = null;
	this.up = null;
	this.down = null;

	this.type = type;
	this.id = id; //either position, quadrant or symbol	
}

//based on Donald Knuth's Dancing Links algorithm

//terminology:
//board - sudoku board
//matrix - DLX matrix
//row, column - of the matrix, not board
//symbol - number on a tile

//assumes board is valid (or blank), and not solved; returns additions as a board-wide array
//board must be either a string of 1 digit number with no spaces or an array, both of 81 elements long. 0 for blank space.
function solve(board){
	//parse board
	var fixed = new Array(9); //[[x, y, quadrant id], ...]
	for (var i = 0; i < 9; i++) fixed[i] = new Array();

	for (var y = 0; y < 9; y++){
		for (var x = 0; x < 9; x++){
			var i = x + y * 9;
			var symbol = board[i];
			if (symbol != 0){
				var q = Math.floor(x / 3) + Math.floor(y / 3) * 3;
				fixed[symbol - 1].push(x, y, q);
			}
		}
	}
	
	//flags (3 per row): (x * 9 + sym) 0 .. 80 | (y * 9 + sym) 0 .. 80 | (quadrant * 9 + sym) 0 .. 80 | 
	//the location nodes mark the place where each of the 9 items is located,
	//while the name node tells what number(label) each item is.
	
	var cols = 81 * 4; //in the matrix

	//the root exists on the top row, to the left of the leftmost header node.
	//it has no up/down links, but otherwise is a normal header node
	var root = new HeaderNode("root", null, "root");

	//the top row, to the right of the root, is the header nodes, one for every column
	var header = new Array(cols);
	var h = root;
	
	for (var i = 0; i < cols; i++){
		var n;
		if (i >= 81) {
			if (i >= 81 * 2) n = new HeaderNode(i - 81 * 2, h, "quadrant");
			else n = new HeaderNode(i - 81, h, "col");
		}
		else n = new HeaderNode(i, h, "row");
		
		header[i] = n;
		h.right = n;
		h = n;
	}

	h.right = root;
	root.left = h;

	var ruler = new Array(cols); //contains the bottom-most nodes created
	for (var i = 0; i < cols; i++) ruler[i] = header[i];
	
	//sym is 0 based here
	var insert = function(x, y, quadrant, sym, header, ruler){
		var p = y * 9 + x;
		var r = x * 9 + sym + 81;
		var c = y * 9 + sym + 81 * 2;
		var q = quadrant * 9 + sym + 81 * 3;
		
		var posFlag = new Node(header[p], null, ruler[p]);
		posFlag.up = ruler[p];
		ruler[p].down = posFlag;
		
		var rowFlag = new Node(header[r], posFlag, ruler[r]);
		rowFlag.up = ruler[r];
		ruler[r].down = rowFlag;

		var colFlag = new Node(header[c], rowFlag, ruler[c]);
		colFlag.up = ruler[c];
		ruler[c].down = colFlag;
		
		var quadFlag = new Node(header[q], colFlag, ruler[q]);
		quadFlag.up = ruler[q];
		ruler[q].down = quadFlag;
		
		posFlag.left = quadFlag;
		posFlag.right = rowFlag;
		rowFlag.right = colFlag;
		colFlag.right = quadFlag;
		quadFlag.right = posFlag;

		//slide down
		ruler[p] = posFlag;
		ruler[r] = rowFlag;
		ruler[c] = colFlag;
		ruler[q] = quadFlag;

		/*var str = '';
		for (var i = 0; i < 81 * 3; i++){
			if (i == r) str += 'r';
			else if (i == c) str += 'c';
			else if (i == q) str += 'q';
			else if (i % 81 == 0) str += '|';
			else str += ' ';
		}
		console.log(str);*/
	};

	var rows = 0;

	//first insert the fixed numbers
	for (var i = 0; i < 9; i++){
		var a = fixed[i];
		for (var e = 0; e < a.length; e += 3){
			var x = a[e + 0];
			var y = a[e + 1];
			var q = a[e + 2];

			insert(x, y, q, i, header, ruler);
			rows++;
		}
	}

	//generate the matrix rows, considering every possible position for each symbol,
	//ensuring that each row is in itself legal, meaning that the same number does not appear more than once
	//for each row or column (of the sudoku grid, not the matrix)
	for (var i = 0; i < 9; i++){
		var a = fixed[i];
		
		//for each of the 9 quadrants
		for (var qy = 0; qy < 3; qy++){
			for (var qx = 0; qx < 3; qx++){
				var q =	qx + qy * 3;

				//illegal if in the same quadrant there is a fixed cell with the same symbol
				var legal = true;
				for (var e = 0; e < a.length; e += 3){
					if (q == a[e + 2]){
						legal = false;
						break;
					}
				}
			
				if (!legal) continue;

				//locally within each quadrant
				for (var ly = 0; ly < 3; ly++){
					for(var lx = 0; lx < 3; lx++){
						var x = qx * 3 + lx;
						var y = qy * 3 + ly;
						legal = true;

						//illegal if on the same row or column (or on the same spot) as a fixed symbol
						for (var e = 0; e < a.length; e += 3){
							if (x == a[e + 0] || y == a[e + 1]){
								legal = false;
								break;
							}
						}

						//if there are no collision with fixed cells, insert the new row
						if (legal){
							insert(x, y, q, i, header, ruler);
							rows++;
						}
					}
				}
			}
		}			
	}
	
	console.log("there are " + cols + " cols");

	//now link all the columns at the top and bottom
	for (var i = 0; i < cols; i++){
		header[i].up = ruler[i];
		ruler[i].down = header[i];
	}

	//a little sanity check
	for (var r = root.right.down; r != root.right; r = r.down){
		for (var c = r.right; c != r; c = c.right){
			var v = 1;
			for (var row = c.right; row != c; row = row.right) v++;
			if (v != 4)
				alert("v not 3");
		}
	}

	//now get solving
	var complete = new Array(81);
	for (var i = 0; i < 81; i++) complete[i] = 0;

	//a container to hold whether the thing was solved
	var solved = {
		done : false
	};

	var solutionRows = new Array(cols); //references to rows
	solveSearch(root, 0, solutionRows, complete, solved);
	
	return complete;
}

function cover(column){
	//remove self
	column.right.left = column.left; 
	column.left.right = column.right;

	for (var r = column.down; r != column; r = r.down){
		for (var c = r.right; c != r; c = c.right){
			//remove each cell
			c.up.down = c.down;
			c.down.up = c.up;
		}
	}
}

function uncover(column){
	for (var c = column.up; c != column; c = c.up){
		for (var r = c.left; r != c; r = r.left){
			r.up.down = r;
			r.down.up = r;
		}
	}

	column.right.left = column;
	column.left.right = column;
}

function solveSearch(root, k, partial, solution, done){
	if (done.done) return;

	if (root.right == root || root.left == root){
		//solution found

		for(var i = 0; i < k; i++){
			var n = partial[i];

			//get the symbol flag
			while(n.header.type != "quadrant") n = n.left;
			var sym = n.header.id % 9 + 1;
			n = n.right;
			
			//n should now be the position flag
			solution[n.header.id] = sym;
		}
			
		done.done = true;
		return;
	}

	// this is supposed to pick the column with the fewest nodes uncovered, but I couldn't get that working in my previous implementation
	// and it's fast enough anyway
	var col = root.right;
	
	cover(col);
	
	for (var row = col.down; row != col; row = row.down){
		partial[k] = row;
		
		for (var n = row.right; n != row; n = n.right)
			cover(n.header);

		solveSearch(root, k + 1, partial, solution, done);
	
		for (var n = row.left; n != row; n = n.left)
			uncover(n.header);
	}

	uncover(col);
}

