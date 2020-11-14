export type ColorStop = LiteralNode | HexNode | RgbNode | RgbaNode

export interface LinearGradientNode {
	type: 'linear-gradient'
	orientation: DirectionalNode | AngularNode
	colorStops: ColorStop[]
}
export interface RepeatingLinearGradientNode {
	type: 'repeating-linear-gradient'
	orientation: DirectionalNode | AngularNode
	colorStops: ColorStop[]
}
export interface RadialGradientNode {
	type: 'radial-gradient'
	orientation?: ShapeNode | DefaultRadialNode
	colorStops: ColorStop[]
}
export interface RepeatingRadialGradientNode {
	type: 'repeating-radial-gradient'
	orientation?: ShapeNode | DefaultRadialNode
	colorStops: ColorStop[]
}
export interface DirectionalNode {
	type: 'directional'
	value: 'left' | 'top' | 'bottom' | 'right'
}
export interface AngularNode {
	type: 'angular'
	value: number
}
export interface LiteralNode {
	type: 'literal'
	/** literal name of the color */
	value: string
}
export interface HexNode {
	type: 'hex'
	/** Hex value, without the pound sign */
	value: string
}
export interface RgbNode {
	type: 'rgb'
	value: [red: number, green: number, blue: number]
}
export interface RgbaNode {
	type: 'rgba'
	value: [red: number, green: number, blue: number, alpha: number]
}
type Position = Record<'x' | 'y', ExtentKeywordNode | PositioningKeywordNode /* | px, em, % ? */>
export interface ShapeNode {
	type: 'shape'
	style?: ExtentKeywordNode | PositioningKeywordNode // | 'px' | 'em' | '%' ?
	value: 'ellipse' | 'circle'
	at: Position
}
export interface DefaultRadialNode {
	type: 'default-radial'
	at: Position
}
export interface PositioningKeywordNode {
	type: 'positioning-keyword'
	value: 'center' | 'left' | 'top' | 'bottom' | 'right'
}
export interface ExtentKeywordNode {
	type: 'extent-keyword'
	value: 'closest-side' | 'closest-corner' | 'farthest-side' | 'farthest-corner' | 'contain' | 'cover'
}
export type Gradient =
	| LinearGradientNode
	| RadialGradientNode
	| RepeatingLinearGradientNode
	| RepeatingRadialGradientNode

export function parse(css: string): Gradient[]
