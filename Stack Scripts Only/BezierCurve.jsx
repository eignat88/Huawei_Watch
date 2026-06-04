
//
// Copyright 2019 Adobe.  All Rights Reserved.
//

// Bezier curve tools.

// This extends the TPoint from Geometry.jsx.
TPoint.lerp = function( t, p0, p1 )
{
    // Note t * (p1 - p0) + p0 === (1-t)*p0 + t * p1
	return (1-t)*p0 + t*p1;
};

// Bezier segment (anchor in, out). Need minimum two segments to
// make a Bezier curve.
function TSegment( pt, inPt, outPt )
{
    this.pt = pt;
    this.inPt = inPt;
    this.outPt = outPt;
    this.corner = false;
}

// One of these days, somebody is re-writing the ActionXxxx classes
// to just take string arguments. Until then...
if (typeof(S) === "undefined")
    var S = function(k) { return stringIDToTypeID(k); }

// Bezier is an array of segments. If pathDesc is specified,
// the Bezier is constructed from the data in the descriptor.
// Assumes the descriptor has a single curve; does not handle
// multiple subpaths or contours.
function Bezier(pathDesc)
{
    this.segments = [];

    if ((typeof pathDesc !== "undefined")
        && (pathDesc.typename === "ActionDescriptor")
        && (pathDesc.hasKey(S("pathComponents"))))
    {
        // Pry the control points loose from the descriptor.
        // If any errors occur, let Photoshop throw the error.
        // This uses full (verbose) actionDescriptor calls to reduce dependencies.

        function getList0(desc, key)
        { return desc.getObjectValue(0).getList(S(key)); }

        var pathComponent = pathDesc.getList(S("pathComponents"));
        var subList = getList0(pathComponent, "subpathListKey");
        var segList = getList0(subList,       "points");

        function getPoint(segNum, key)
        {
            var segDesc = segList.getObjectValue(segNum);
            if (segDesc.hasKey(S(key)))
            {
                var ptDesc = segList.getObjectValue(segNum).getObjectValue(S(key));
                var x = ptDesc.getUnitDoubleValue(S('horizontal'));
                var y = ptDesc.getUnitDoubleValue(S('vertical'));
                return new TPoint(x,y);
            }
            else
                return null;
        }
    
        for (var i=0; i < segList.count; ++i)
        {
            var a = getPoint(i, 'anchor');
            var b = getPoint(i, 'backward');
            var f = getPoint(i, 'forward');
            // Some segments -just- have anchor points, so fill in the missing points
            // with the anchor if that happens.
            this.segments.push( new TSegment( a, b ? b : a, f ? f : a ) );
        }

        // Replicate "closed" path by duplicating the first point at the end
        var subListObj = subList.getObjectValue(0);
        if (subListObj.hasKey(S("closedSubpath")) && subListObj.getBoolean(S("closedSubpath")))
            this.segments.push( new TSegment( this.segments[0].pt, this.segments[0].inPt, this.segments[0].outPt ));
     }
}

// Return path from reference get
function _getPathFromReference(ref)
{
	var pathContents = executeActionGet( ref );
	if (pathContents && pathContents.hasKey(S("pathContents")))
		return new Bezier(pathContents.getObjectValue(S("pathContents")));
	else
		return null;
}

// Get a curve from one of the paths in the paths panel.
// If no argument is given, it tries to get the work path,
// otherwise it gets the named path. If no path is found,
// it returns null.
Bezier.getWorkPath = function(pathName)
{
    var ref = new ActionReference();
    if (typeof pathName !== "string")
        ref.putProperty( S("path"), S("workPath") );
    else
        ref.putName( S("path"), pathName );
    return _getPathFromReference(ref);
}

Bezier.getActiveLayerMask = function()
{
    var ref = new ActionReference();
    ref.putEnumerated( S("path"), S("ordinal"), S("vectorMask") );
    ref.putEnumerated( S("layer"), S("ordinal"), S("targetEnum") );
    return _getPathFromReference(ref);
}

// Create a path action descriptor from the Bezier.
Bezier.prototype.makeDescriptor = function()
{
    function pointDesc(p) {
        var ptDesc = new ActionDescriptor();
        ptDesc.putUnitDouble(S('horizontal'), S('pixelsUnit'), p.fX);
        ptDesc.putUnitDouble(S('vertical'),   S('pixelsUnit'), p.fY);
        return ptDesc;
    }
    function segDesc(seg) {
        var sDesc = new ActionDescriptor();
        sDesc.putObject(S('anchor'),   S("point"), pointDesc(seg.pt));
        sDesc.putObject(S('backward'), S("point"), pointDesc(seg.inPt));
        sDesc.putObject(S('forward'),  S("point"), pointDesc(seg.outPt));
        return sDesc;
    }

    var segList = new ActionList();
    for (i = 0; i < this.segments.length; ++i)
        segList.putObject(S("segment"), segDesc(this.segments[i]));

    var pathDesc = new ActionDescriptor();
    var pathComponentList = new ActionList();
    var subPathList = new ActionList();
    var subPathObject = new ActionDescriptor();
    var segObject = new ActionDescriptor();

    segObject.putList(S("points"), segList);
    subPathList.putObject(S("subpathListKey"), segObject);
    subPathObject.putList(S("subpathListKey"), subPathList);
    pathComponentList.putObject(S("pathComponents"), subPathObject);
    pathDesc.putList(S('pathComponents'), pathComponentList);
    return pathDesc;
}

// Set the curve as the Photoshop work path. 
// Note you can *only* set the work path in Photoshop.
// from the event system. You can't set a named path
// or a layer mask.
Bezier.prototype.setWorkPath = function()
{
    var ref = new ActionReference();
    ref.putProperty( S("path"), S("workPath") );
    
    var desc = new ActionDescriptor();
    var pathDesc = this.makeDescriptor();
    desc.putReference( S("null"), ref );	// keyNull = 'null'
    desc.putList( S("to"), pathDesc.getList(S("pathComponents")) );
    executeAction( S("set"), desc, DialogModes.NO );
}

// Create a new layer with the specified vector mask.
// NOTE: This RESETS the work path.
Bezier.prototype.makeLayer = function( red, green, blue )
{
    if (typeof red   === "undefined") red = 0.0;
    if (typeof green === "undefined") green = 0.0;
    if (typeof blue  === "undefined") blue = 0.0;
    
    this.setWorkPath();
    var ref = new ActionReference();
    ref.putClass( S("contentLayer") );
    var desc = new ActionDescriptor();
    desc.putReference( S("null"), ref );
    var layerDesc = new ActionDescriptor();
    var colorDesc = new ActionDescriptor();
    var rgbDesc = new ActionDescriptor();
    rgbDesc.putDouble( S("red"),   red );
    rgbDesc.putDouble( S("green"), green );
    rgbDesc.putDouble( S("blue"),  blue );
    colorDesc.putObject( S("color"), S("RGBColor"), rgbDesc );
    layerDesc.putObject( S("type"), S("solidColorLayer"), colorDesc );
    desc.putObject( S("using"), S("contentLayer"), layerDesc );
    executeAction( S("make"), desc, DialogModes.NO );
}

Bezier.prototype.numSegs = function()
{
    return this.segments.length;
};

Bezier.prototype.numPts = function()
{
    return this.segments.length * 3;
};

Bezier.prototype.isValid = function()
{
    return (this.segments.length >= 2) && this.segments[0];
};

Bezier.prototype.addSegment = function(segment)
{
    this.segments.push(segment);
}

// Adds a sharp discontiniuty to the path
Bezier.prototype.lineTo = function( pt )
{
    this.addSegment(new TSegment( pt, pt, pt ) );
}

// Adds a curved segment ending in p2;
// prev.outPt = p1, cur.inPt = p2, cur.pt = p3;
Bezier.prototype.curveTo = function( p1, p2, p3 )
{
    var curSeg = this.segments.length - 1;
    if (curSeg < 0)
        throw "Bezier must start with a point";
    this.segments[curSeg].outPt = p1;
    this.segments.push( new TSegment( p3, p2, p3 ));
}

// Create an arg segment running from p0 to p3, given an arc 
// ranging from 0 degrees (infinite radius, straight line) to
// PI/2 (180 degree arc of radius ||p3-p0||/2)
function _makeArcSeg(arc, p0, p3)
{
    const M_PI = Math.PI;
    var baseDist = p0.distanceTo(p3);

    var pts = [p0, new TPoint(0,0), new TPoint(0,0), new TPoint(p0.fX + baseDist, p0.fY)];
	var negative = false;
	if (arc <0)
	{
		negative = true;	// Handle sign separately below
		arc = -arc;
	}
	// Values near zero will cause division by zero - skip it.
	if (arc < 0.001)
	{
		var third = 1.0/3.0;
		pts[0] = p0;
		pts[3] = p3;
		// Middle poiints on straight line between pts[0] and pts[1]
		pts[1] = pts[0] * 2/3 + pts[3] / 3;
		pts[2] = pts[0] / 3   + pts[3] * 2/3;
		return pts;
	}
	var halfWidth = (pts[3].fX - pts[0].fX) * 0.5;

	// Flip range to be somewhat more intuitive
	var alpha = (M_PI/2.0) - arc;

	// Distance from center of the circle to bottom left of the bounds
	var radius = halfWidth / Math.cos(alpha);

	// Now that we know the inner and outer radii, we
	// can make the control points for a unit circle
	// arc, and project them up to the rectangle.  

	var p = [];
	//   |
	//*p1| *p2       Crude picture
	//   |    * p3   of the points forming
	//   |   /       the arc of (pi/2)-alpha
	//   |  /
	//   | /
	//   |/ alpha
	//   +------------------
	//
	// Compute the Bezier control points for an arc
	// of a unit circle.  The formulation for the unit
	// arc control points were graciously derived
	// by Martin Newell.

	// Note Martin's "alpha" was opposite mine...
	var ca = Math.cos( M_PI/2.0 - alpha );
	var sa = Math.sin( M_PI/2.0 - alpha );
	var y1 = (4 - ca) / 3.0;
	p[3] = new TPoint( sa, ca );
	p[2] = new TPoint((1.0 - y1*ca)/sa, y1 );
	p[1] = new TPoint( -p[2].fX, y1 );
	p[0] = new TPoint( -p[3].fX, p[3].fY );

	// Distance from center of the top of the bounds to the
	// center of the circle.
	var d = Math.sqrt(radius*radius - halfWidth*halfWidth);
	// center of the circle 
	var center = new TPoint( pts[0].fX + halfWidth, pts[0].fY + d );
	// If it's negative, flip over the arc vectors and center.
	if (negative)
		center.fY = pts[0].fY - d;	// Center is above
	else
		for (var i = 0; i < 4; i++)
			p[i].fY = - p[i].fY;

	// Apply the arcs to the top and bottom row (Martins' points
	// are right to left, the mesh is left to right).
	for (i = 0; i < 4; i++)
		pts[i] = p[i] * radius + center;
	
	// Rotate the X-axis arc created above back into place
    var baseAngle = (p3 - p0).vectorAngle();
	for (i = 1; i < 4; ++i)
	    pts[i] = (pts[i] - pts[0]).rotate(baseAngle) + pts[0];

	return pts;
}

// See above (here p1 == p3). If startSeg is specified, the
// arc is added at that segment.
Bezier.prototype.setArc = function(arcVal, p0, p1, startSeg)
{
    if (! startSeg)
        startSeg = 0;
    var pts = _makeArcSeg(arcVal, p0, p1);
    if (startSeg == 0) {
        this.segments[0] = new TSegment(pts[0], pts[0], pts[1]);
        this.segments[1] = new TSegment(pts[3], pts[2], pts[3]);
    }
    else {
        this.segments[startSeg-1].pt = pts[0];
        this.segments[startSeg-1].outPt = pts[1];
        this.segments[startSeg] = new TSegment(pts[3], pts[2], pts[3]);
    }
};

// Resets the Bezier to a circle (mostly a tutorial for setArc)
Bezier.prototype.setCircle = function(center, radius)
{
    this.segments = [];
    var pi4 = Math.PI/4;
    var cx = center.fX, cy = center.fY, r = radius;
    this.setArc( pi4, new TPoint(cx - r, cy), new TPoint(cx, cy - r) );
    this.setArc( pi4, new TPoint(cx, cy - r), new TPoint(cx + r, cy), 2);
    this.setArc( pi4, new TPoint(cx + r, cy), new TPoint(cx, cy + r), 3);
    this.setArc( pi4, new TPoint(cx, cy + r), new TPoint(cx - r, cy), 4);
};

// Deep copy
Bezier.prototype.clone = function()
{
    var newBez = new Bezier();
	for (var i = 0; i < this.segments.length; ++i) {
		var seg = this.segments[i];
		newBez.segments.push( new TSegment(new TPoint(seg.pt.fX, seg.pt.fY ),
										   new TPoint(seg.inPt.fX, seg.inPt.fY ),
										   new TPoint(seg.outPt.fX, seg.outPt.fY ) ) );
	}
    return newBez;
};

Bezier.prototype.getBounds = function()
{
    if (this.segments.length < 1)
        return new TRect();
    
    var self = this;
    var bounds = new TRect(self.segments[0].pt, self.segments[0].pt);

    for (var i = 0; i < self.segments.length; ++i)
        ['inPt', 'pt', 'outPt'].forEach(function(k) 
            { bounds.extendTo(self.segments[i][k]) } );
    return bounds;
}

Bezier.prototype._getSegPoints = function(seg)
{
    var V = this.segments;
    return [V[seg].pt, V[seg].outPt, V[seg+1].inPt, V[seg+1].pt];
}

// Computes Bezier coeficient B_i(t)
function _bezCoef( i, t )
{
    var tmp = 1.0-t;
    switch (i)
    {
    case 0: return tmp*tmp*tmp;
    case 1: return 3*tmp*tmp*t;
    case 2: return 3*tmp*t*t;
    case 3: return t*t*t;
    default: $.writeln("Bogus coef index: " + i);
    }
}

// Quadratic Bezier coefficients (used for derivatives)
function _quadBezCoef( i, t )
{
    var tmp = 1.0-t;
    switch (i) {
        case 0: return tmp*tmp;
        case 1: return 2*tmp*t;
        case 2: return t*t;
        default: $.writeln("Bogus quadratic coef index: " + i);
    }
}

// Computes the derivative of the curve segment at t
function _evalBezDeriv( t, seg )
{
    var dpt = new TPoint(0,0);
    
    for (var i = 0; i < 3; ++i)
    {
        var dcoef = _quadBezCoef(i, t) * 3;
        dpt += dcoef * (seg[i+1] - seg[i]);
    }
    return dpt;
}

// Find the tangent to the curve (1st derivative) at t
Bezier.prototype.tangent = function(t)
{
    var segNum = t|0;
    if (segNum === this.segments.length-1)
        segNum--;   // Will evaluate at t==1, OK

    var segs = this.segments;
    var segPts = [segs[segNum].pt, segs[segNum].outPt,
                  segs[segNum+1].inPt, segs[segNum+1].pt];
    return _evalBezDeriv( t - segNum, segPts );
};

// Classic Bezier evaluation
Bezier.prototype.evaluate = function( param )
{
    var seg = param|0;
    var t = param - seg;    // Parameter within segment
     
    if ((t === 0) || (seg === this.segments.length - 1))   // Trivial cases
        return this.segments[seg].pt;
        
    var i, P = this._getSegPoints(seg);
    var sum = new TPoint(0,0);
    
    for (i = 0; i < 4; i++)
    {
        var tmp = _bezCoef( i, t );
        sum.fX += P[i].fX * tmp;
        sum.fY += P[i].fY * tmp;
    }
    return sum;
};

// Find segment extrema parameters, part of the offset process.
// Returns list of extrema (endpoints not included).
function _findSegExtrema( pts )
{
	// Based on https://pomax.github.io/bezierinfo/#tightbounds
	// quadratic coefficients of the derivative of the cubic spline segment

	var Ax = 3*(-pts[0].fX + 3*pts[1].fX - 3*pts[2].fX + pts[3].fX);
	var Ay = 3*(-pts[0].fY + 3*pts[1].fY - 3*pts[2].fY + pts[3].fY);
	var Bx = 6*(pts[0].fX - 2*pts[1].fX + pts[2].fX);
	var By = 6*(pts[0].fY - 2*pts[1].fY + pts[2].fY);
	var Cx = 3*(pts[1].fX - pts[0].fX);
	var Cy = 3*(pts[1].fY - pts[0].fY);
    
    // Quadratic equation
    function quadEq( sign, a, b, c )
    {
        // Handle linear / degenerate cases first
        if (a == 0.0) return (b == 0.0) ? 0.0 : (-c / b);
        return (-b + sign*Math.sqrt(b*b - 4*a*c)) / (2*a);
    }
    
	// Find parameters of the inflection points (where derivative == 0)
	// i.e., find t such that A*t^2 + B*t + C = 0
    var t0x = quadEq( +1, Ax, Bx, Cx );
    var t0y = quadEq( +1, Ay, By, Cy );
    var t1x = quadEq( -1, Ax, Bx, Cx );
    var t1y = quadEq( -1, Ay, By, Cy );
    
    function paramInSeg(t)
    { return ((t > 0.0) && (t < 1.0)); }
    
    return ([t0x, t0y, t1x, t1y].sort(function(a,b) {return a-b;})).filter( paramInSeg );
}

// This gets the "tight" bounds of the curve. Regular getBounds
// just looks at the control points, this actually looks at the
// mathematical edges of the curve.
Bezier.prototype.getTightBounds = function()
{
    if (this.segments < 2)
        return this.getBounds();
    
    var bounds = new TRect(this.segments[0].pt, this.segments[0].pt)
    var self = this;

    for (var i = 0; i < this.segments.length-1; ++i)
    {
        var segPts = this._getSegPoints(i);
        bounds.extendTo(segPts[3]);
        tExtrm = _findSegExtrema(segPts);
        tExtrm.forEach(function(t) {bounds.extendTo(self.evaluate(i + t));});
    }
    return bounds;
}

// This finds all extrema points *within* the curve segments.
// The segment endpoints are also often extrema, but these
// are not returned by this routine.
Bezier.prototype.extrema = function()
{
    if (this.segments.length < 2) return [];
    var result = [];
    var segs = this.segments;
    for (var i = 0; i < segs.length - 1; ++i) {
        var segExt = _findSegExtrema([segs[i].pt, segs[i].outPt,
                                      segs[i+1].inPt, segs[i+1].pt]);
        segExt = segExt.map( function(t) {return t + i;} );
        result = result.concat(segExt);
    }
    return result;
};

// Find the curve length via Guassian Quadrature
// Measures the length from t0 to t1 (if not supplied, meausres the
// whole path; if just t0 is supplied, measures 0..t0).
Bezier.prototype.curveLength = function(t0, t1)
{
    // From Numerical Recipes, sec. 4.5
    function _gaussianQuadrature(a, b, integrand)
    {
        var j, range, midpoint, dx, sum;
    
    	// Quadrature weights.  These are good for up to order 10, and
    	// probably overkill for curves less than that.
    	var x = [0.0,0.1488743389,0.4333953941, 0.6794095682,0.8650633666,0.9739065285];
    	var w = [0.0,0.2955242247,0.2692667193, 0.2190863625,0.1494513491,0.0666713443];
    
    	midpoint = 0.5 * (b + a);
    	range = 0.5 * (b - a);
    	sum = 0;
    	for (j = 1; j <= 5; j++) {
    		dx = range * x[j];
    		sum += w[j] * (integrand.eval(midpoint + dx) + integrand.eval(midpoint - dx));
    	}
    	return sum * range;
    }
    
    // Create a function to evaluate for the gauss quadrature routine.
    // Note "this" refers to the CurveIntegrator object, not this Bezier.
    function CurveIntegrator( crv ) { this.crv = crv; }
    CurveIntegrator.prototype.eval = function(t) {
        return this.crv.tangent(t).vectorLength();
    };

    // Supply default values. If one arg, 0..t0; two args t0..t1
    if (typeof t1 === "undefined") {
        t1 = (typeof t0 === "undefined") ? this.segments.length-1 : t0;
        t0 = 0.0;
    }

    var seg0 = t0|0;
    var segN = t1|0;
    if (t1 - segN > 0) segN++;

    var thisIntegrator = new CurveIntegrator(this);
    var curveLen = 0.0;
    
    for (var i = seg0; i < segN; ++i) {
        var u0 = (i === seg0) ? t0 : i;
        var u1 = (i === segN-1) ? t1 : i+1;
        curveLen += _gaussianQuadrature(u0, u1, thisIntegrator);
    }
    return curveLen;
};

// Cache seg lengths for further processing. These are assumed to
// be active *only* during arc-length computations, they should be
// removed afterwards.
Bezier.prototype._cacheSegLengths = function()
{
    this.segLengths = [];
    for (var i = 0; i < this.segments.length-1; ++i)
        this.segLengths.push(this.curveLength(i, i+1));
};

// Generate parameters to split the curve into equal *arc-length*
// intervals. segDivisor is the number of pieces to split the
// shortest (arc-length) segment into.
Bezier.prototype.arcLengthSplits = function(segDivisor)
{
    if (typeof segDivisor === "undefined")
        segDivisor = 2;
    this._cacheSegLengths();
    var minSegLen = Infinity;
	for (var i = 0; i < this.segLengths; ++i)
		if (this.segLengths[i] < minSegLen)
			minSegLen = this.segLengths[i];

	var newSegLen = minSegLen / segDivisor;
    var result = [];
    var curDist = 0;
    for (var i = 0; i < this.segLengths.length; ++i)
    {
        var numDivs = Math.round(this.segLengths[i]/newSegLen);
        var segDistStep = this.segLengths[i]/numDivs;
        for (var div = 1; div < numDivs; div++)
            result.push( this.paramAtLength( curDist + segDistStep*div ));
        curDist += this.segLengths[i];
    }
    delete this.segLengths;
    return result;
};

// Given a distance along the curve, search for the 
// parameter corresponding to it.
Bezier.prototype.paramAtLength = function(distance)
{
    // If the segLengths aren't there, create them
    // for the life of this function.
    var segsCreated = false;
    if (! this.segLengths) {
        this._cacheSegLengths();
        segsCreated = true;
    }

	var totalLength = 0.0;
	for (var i = 0; i < this.segLengths.length; ++i)
		totalLength += this.segLengths[i];

    if (distance > totalLength)
        return this.segments.length-1;  // Beyond the end
    
    // Search for the relevant segment. This makes subsequent
    // calls to curveLength() focus on a single segment, minimizing
    // the iterations it needs to do.
    var seg = 0;
    var curLen = 0.0;
    while ((seg < this.segLengths.length) 
            && (curLen + this.segLengths[seg] < distance)) {
        curLen += this.segLengths[seg];
        seg++;
    }

    var segDist = distance - curLen;
    var t_seg = segDist / this.segLengths[seg];
    var firstGuess = t_seg;
    var err = segDist - this.curveLength( seg, seg + t_seg );
    
    var t0 = 0.0;
    var t1 = 1.0;
    var iterationCount = 0;
    const kMaxIteration = 50;
    
    // Bisection search for the actual parameter. Newton iteration
    // could be faster, need to find the derivative of the length.
    while ((iterationCount < kMaxIteration) && (Math.abs(err) > 0.001))
    {
        if (err < 0) {
            t1 = t_seg;
            t_seg = (t0 + t_seg) / 2;
        }
        else
        {
            t0 = t_seg;
            t_seg = (t1 + t_seg) / 2;
        }
        err = segDist - this.curveLength( seg, seg + t_seg );
        iterationCount++;
    }
    
    // Ooops, didn't converge
    if (iterationCount == kMaxIteration)
        return firstGuess + seg;

    // Remove the segLenths cache if we created it.
    if (segsCreated)
        delete this.segLengths;

    return t_seg + seg;  
};

//
// Split a bezier curve segment via repeated linear interpolation.
// Think of evaluating a Bezier via lerps:  It turns out
// the points computed along the way also form the control
// meshes of the two subdivided halves.
//
Bezier.prototype.splitSegment = function( t, segIndex )
{
	// First point, last point, and first left point are
	// always the same.
    var left = [], right = [];
    var srcSeg = this._getSegPoints(segIndex);
	
	left[0]  = srcSeg[0];
	right[3] = srcSeg[3];
	left[1]  = TPoint.lerp( t, srcSeg[0], srcSeg[1] );

	var mid  = TPoint.lerp( t, srcSeg[1], srcSeg[2] );
	left[2]  = TPoint.lerp( t, left[1],   mid );
	right[2] = TPoint.lerp( t, srcSeg[2], srcSeg[3] );
	right[1] = TPoint.lerp( t, mid,       right[2] );
	left[3]  = TPoint.lerp( t, left[2],   right[1] );
	
	// Two halves share a central point.
	right[0] = left[3];
	
	var newSeg = new TSegment(right[0], left[2], right[1] );
	this.segments.splice(segIndex + 1, 0, newSeg );
	this.segments[segIndex].outPt = left[1];
	this.segments[segIndex + 2].inPt = right[2];
};

// Break up the curve according to split parameters. If "splits"
// is a single number, just split the curve at that point, otherwise,
// split at an array of split values (assumed to be increasing and
// contain no duplicates). Note integer values are ignored, because
// the curve is already "split" at those points.
Bezier.prototype.splitCurve = function(splits)
{
    if (typeof splits === "number")
    {
        var seg = splits|0;
        if (seg !== splits)
            this.splitSegment(splits - seg, seg);
    }
    else    // Assume splits is a list of segments
    {
        for (var i = splits.length-1; i >= 0; i--)
        {
            var seg = splits[i]|0;
            var t = splits[i];
            // Don't "split" on existing boundaries.
            if (seg !== t) {
        		// If there are multiple splits within a segment, their
        		// range must be adjusted as the curve is trimmed to reflect
        		// the updated range of the trimmed curve.
                for (var j = i -1; j >= 0; --j)
                    if ((splits[j]|0) === seg)
                        splits[j] = ((splits[j] - seg) / (t-seg)) + seg;
                this.splitSegment( splits[i] - seg, seg );
            }
        }
    }
};

// Create an offset to the Bezier. Will likely have more segments
// than the source, because a Bezier cannot perfectly represent the
// offset to a Bezier.
Bezier.prototype.createOffset = function(distance)
{
/*
	// Split the curve into equal arc-length steps, to make
	// the offset as uniform parametrically as possible. Remember,
	// the *source* parameter space the original text is in, is always
	// split into equal lengths. Thus, we want the *destination* the
	// text is warped into to be as uniform as possible along the 
	// length of the curve, to avoid non-uniform distortion of the text
    // along the horizontal axis. NOTE: This approach is depricated
    // in favor of properly parameterizing the lengths of the base curve.
      var clone = this.clone();
	var splits = clone.arcLengthSplits(2);
*/
    // First clone the curve, then split it at the x, y
    // extrema (if any) for each segment. Suggested by
    // pomax.github.io/bezierinfo/#offsetting as a way to getting
    // a reasonable number of subdivisions to start with.
    var clone = this.clone();
    var splits = clone.extrema();

	clone.splitCurve(splits);

    // Create an offset to the segment using Tiller & Hanson's method.
    // This is a simple geometric offset of the control mesh that 
    // recomputes the interiour points. Great diagram at
    // https://math.stackexchange.com/a/467038
    function offsetSeg( pts )
    {
        // Handle straight lines as a special case.
        if ((pts[0] === pts[1]) && (pts[2] === pts[3]))
        {
            var vs = pts[2] - pts[0];
            var perps = new TPoint(vs.fY, -vs.fX);
            var result = [];
            perps = perps.normalize() * distance;
            for (var i = 0; i < 4; ++i)
                result.push(pts[i] + perps);
            return result;
        }

        var v = [], perp = [];
        for (var i = 0; i < 3; ++i) {
            v.push( pts[i+1] - pts[i] );
            perp.push(new TPoint(v[i].fY, -v[i].fX));
            perp[i] = perp[i].normalize() * distance;
        }
        
        var P0 = pts[0] + perp[0];
        var m1 = pts[1] + perp[1];
        var P1 = TPoint.lineSegmentIntersect( P0, P0 + v[0], m1, m1 + v[1], false );
        if (P1.fX === Math.INF)   // Parallel lines
            P1 = m1;
        var P3 = pts[3] + perp[2];
        var P2 = TPoint.lineSegmentIntersect( P1, P1 + v[1], P3 - v[2], P3, false );
        if (P2.fX === Math.INF)
            P2 = pts[2] + perp[1];
        return [P0, P1, P2, P3];
    }
    
    // Process all of the segments.
    var numSegs = clone.segments.length;
    var result = new Bezier();
    for (var i = 0; i < numSegs-1; ++i)
    {
        var segs = clone.segments;
        var offseg = offsetSeg([segs[i].pt, segs[i].outPt, segs[i+1].inPt, segs[i+1].pt]);
        if (i === 0)
            result.segments.push(new TSegment(offseg[0], offseg[0], offseg[1]));
        else
            result.segments[i].outPt = offseg[1];
        result.segments.push( new TSegment( offseg[3], offseg[2], offseg[3]));
    }
    return [result, clone];
};
