import { Graphics } from "pixi.js"

export const drawBoard = (board: Graphics, width: number, height: number): void => {
  board.clear()
  board.roundRect(0, 0, width, height, 28)
  board.fill(0x0b1119)

  for (let x = 20; x < width; x += 40) {
    board.moveTo(x, 16)
    board.lineTo(x, height - 16)
  }
  for (let y = 20; y < height; y += 40) {
    board.moveTo(16, y)
    board.lineTo(width - 16, y)
  }

  board.stroke({
    color: 0x1d2a38,
    width: 1,
    alpha: 0.7
  })
  board.roundRect(0, 0, width, height, 28)
  board.stroke({
    color: 0x5bc0be,
    width: 2,
    alpha: 0.45
  })
}
