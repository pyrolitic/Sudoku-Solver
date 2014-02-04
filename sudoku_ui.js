'use strict';

var board = function() {
	var data = new Array(81);
	var additions = null;
	var errorTimer = new Array(81);

	var errorTimerMax = 5;

	var state = "adding"; //adding, solved

	//selection
	var sX = 0;
	var sY = 0;

	//drawing
	var context = null;
	var w = 500;
	var h = 500;
	var f = 0;

	var normalCol = "rgb(70, 120, 70)";
	var errorCol = "rgb(255, 60, 60)";
	var fixedCol = "rgb(50, 50, 50)";
	var completedCol = "rgb(80, 120, 190)";
	
	function errorColStage(x){
		var lerp = function(a, b, x, max){
			return (max - x) * a + b * x;
		}
		
		var r;
		if (x > errorTimerMax - 4) r = lerp(200, 255, x - errorTimerMax, 4);
		else r = lerp(255, 70, x - errorTimerMax - 4, errorTimerMax - 4);

		var r = (x * 255) / errorTimerMax + 150;
		return "rgb(" + Math.floor(r) + ", " + 70 + ", " + 70 + ")";
	}
	
	function paint(){
		context.clearRect(0, 0, w, h);
		
		//first the grid
		context.strokeStyle = "rgba(0, 0, 0, 255)";
		for (var i = 0; i <= 9; i++){
			if (i % 3 == 0) context.lineWidth = 5;
			else context.lineWidth = 1;
			
			context.beginPath();
			context.moveTo(i * f, 0);
			context.lineTo(i * f, h);
			context.closePath();
			context.stroke();

			context.beginPath();
			context.moveTo(0, i * f);
			context.lineTo(w, i * f);
			context.closePath();
			context.stroke();
		}

		//now the numbers
		context.font = "45pt Helvetica";
		for (var j = 0; j < 9; j++){
			for (var i = 0; i < 9; i++){
				var sym = data[i + j * 9];
				if (state === "solved"){
					if (sym == 0){
						sym = additions[i + j * 9];
						context.fillStyle = completedCol;
					}
					else context.fillStyle = fixedCol;
				}
				else{
					var err = errorTimer[i + j * 9];
					context.fillStyle = (err > 0)? errorColStage(err) : normalCol;
				}

				if (sym != 0){
					var x = i * f + 12;
					var y = (j + 1) * f - 7;
				
					context.fillText(String(sym), x, y);
					context.lineWidth = 1.2;
					context.strokeText(String(sym), x, y);
				}
			}
		}

		//now the selection
		//context.globalCompositeOperation = "lighter";
		context.strokeStyle = "rgba(180, 100, 90, 255)";
		context.lineWidth = 5;
		context.strokeRect(sX * f, sY * f, f, f);
	}

	return {
		//public methods
		init : function(canvasContext){
			context = canvasContext;
		},

		setGrid : function(grid){
			data = grid;
			state = "adding";
			additions = new Array(81);
		},
		
		reset : function (){
			for (var i = 0; i < 81; i++){
				data[i] = 0;
				errorTimer[i] = 0;
			}

			f = w / 9;

			state = "adding";
		},

		update : function(){
			if (state === "adding"){
				for (var i = 0; i < 81; i++){
					errorTimer[i] -= 1;
					if (errorTimer[i] < 0) errorTimer[i] = 0;
				}
			}

			paint();
		},

		solve : function(){
			//clear error timers
			for (var i = 0; i < 81; i++) errorTimer[i] = 0;

			var begin = new Date().getTime();
			var complete = solve(data); //see sudoku.js
			var elapsed = new Date().getTime() - begin;
			console.log("that took " + elapsed + " milliseconds");
			
			for (var i = 0; i < 81; i++){
				if (data[i] == 0) additions[i] = complete[i];
			}
			
			state = "solved";
		},

		moveLeft : function(){
			sX = (sX == 0)? 8 : sX - 1;
		},
		moveRight : function(){
			sX = (sX == 8)? 0 : sX + 1;
		},
		moveUp : function(){
			sY = (sY == 0)? 8 : sY - 1;
		},
		moveDown : function(){
			sY = (sY == 8)? 0 : sY + 1;
		},

		click : function(x, y){
			sX = Math.floor(x / w * 9);
			sY = Math.floor(y / h * 9);
		},

		setCell : function (sym){
			if (state == 'solved') state = 'adding';
		
			var able = true;
		
			var old = data[sX + sY * 9];
			if (sym == old) return;

			//musn't lie on the same row or column
			for (var i = 0; i < 9; i++){
				if (data[i + sY * 9] == sym){
					able = false; 
					errorTimer[i + sY * 9] = errorTimerMax;
				}
				if (data[sX + i * 9] == sym){
					able = false;
					errorTimer[sX + i * 9] = errorTimerMax;
				}
			}

			//musn't lie in the same quadrant
			var qx = Math.floor(sX / 3);
			var qy = Math.floor(sY / 3);
			for (var y = 0; y < 3; y++){
				for (var x = 0; x < 3; x++){
					var i = x + qx * 3;
					var j = y + qy * 3;
					if (data[i + j * 9] == sym){
						able = false; 
						errorTimer[i + j * 9] = errorTimerMax;
					}
				}
			}

			if (able){
				data[sX + sY * 9] = sym;
				state = "adding";
				additions = new Array(81);
			}
		},

		clearCell : function (){
			data[sX + sY * 9] = 0;
		},
	};
}();

function numericKey(keyCode){
	var n = (keyCode >= 0x60)? keyCode - 0x60 : keyCode - 0x30;
	if (n >= 0 && n <= 9) return n;
	else return -1;
}

$(document).ready(function() {
	var canvas = document.getElementById("sudoku_canvas");
	board.init(canvas.getContext('2d'));

	canvas = $("#sudoku_canvas");
	canvas.keydown(function(event){
		var key = numericKey(event.keyCode);
		if (key >= 0) board.setCell(key);
		else if (event.keyCode == 8 || event.keyCode == 46) board.clearCell(); //backspace or delete

		else if (event.keyCode == 37) board.moveLeft();
		else if (event.keyCode == 38) board.moveUp();
		else if (event.keyCode == 39) board.moveRight();
		else if (event.keyCode == 40) board.moveDown();
		
		else if (event.keyCode == 83) $("#solve").click(); //s
		else if (event.keyCode == 67) $("#clear").click(); //c

		//board.paint();
	});

	canvas.click(function(event){
		board.click(event.pageX - canvas.offset().left, event.pageY - canvas.offset().top);
		//board.paint();
	});

	$("#clear").click(function(){
		board.reset();
		canvas.focus();
	});

	$("#solve").click(function(){
		board.solve();
		canvas.focus();
	});

	//update 10 times per second
	window.setInterval("board.update()", 100);
	
	board.reset();
	canvas.focus();

	//populate the board cause it's boring by hand
	board.setGrid([
		2, 0, 0,     8, 0, 1,     0, 5, 0,
		0, 0, 0,     0, 9, 0,     7, 0, 0,
		0, 0, 5,     0, 0, 2,     0, 0, 8,
 

		6, 9, 0,     0, 0, 4,     5, 2, 0, 
		0, 4, 2,     0, 0, 0,     3, 8, 0, 
		0, 5, 8,     2, 0, 0,     0, 4, 6,

		
		5, 0, 0,     1, 0, 0,     8, 0, 0, 
		0, 0, 7,     0, 2, 0,     0, 0, 0, 
		0, 1, 0,     9, 0, 3,     0, 0, 4
	]);
});
