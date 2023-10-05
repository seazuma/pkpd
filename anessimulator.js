﻿/*
 This file is not used in the main content (https://seazuma.github.io/pkpd/),
 but only used for external implementation.
 v1.7.0
*/ 

var Lang = "ja";
function changeLang(y){
 Lang = y;
 var i, elm_lang, elms = document.getElementsByTagName("div");
 for (i = 0; i < elms.length; i++) {
  if(elm_lang = elms[i].lang){
   elms[i].style.display = elm_lang==y? "block": "none";
  }
 }
 elms = document.getElementsByTagName("span");
 for (i = 0; i < elms.length; i++) {
  if(elm_lang = elms[i].lang){
   elms[i].style.display = elm_lang==y? "inline": "none";
  }
 }
 elms = document.getElementById("selectLang").children;
 for (i = 0; i < elms.length; i++) {
  setClass( elms[i], "button_wide");
 }
 setClass( document.getElementById("select_"+y), "button_wide_selected");
}

// default units are mg, min, L

/* setting */

var Accuracy = 0.000001;

var H = 280, W = 750, O_x = 150, O_y = 30;
var row_H = 30;
var cAX1 = "#666666", cAX2 = "#aaaaaa"; // axis color
var cCH = "#333333"; // char color
var cBG = "#eeffff"; // bg-color
var cCu = "#000000"; // cursor color
var ctx_font_size = 16;
var ctx_font = ctx_font_size + "px sans-serif";

var Compart_color_arr = ["red","blue","green"]; // for canvas2
var CompLineWidth = 80;

var Canvas_common = {
 is_moving: false,
 y_scale: 0, // 1st line = Math.pow(2,y_scale)
 t_scale_150: 60, // time[min] per 150 px
 t_scale: 0.2, // time[min] per px
 t1: new Date().getHours()*60, // time at origin
 dx : 1, // plot_interval [px]
 x_arr: [],
 ready: function(){
  this.x_arr = [];
  var x;
  for(x=0; x<W; x+=this.dx){
   this.x_arr.push(x);
 }},
 update: function(t1, t_150){
  this.is_moving = false;
  this.t1 = t1;
  this.t_scale_150 = t_150;
  this.t_scale = t_150/150;
  this.t0 = x2t(0); // time at left edge
  this.t2 = x2t(W); // time at right edge
 }
};

var UnitInfo = function(is_infusion, is_per_kg, is_per_mL, mg_per_val){
 this.is_infusion = is_infusion;
 this.is_per_kg = is_per_kg; 
 this.is_per_mL = is_per_mL;
 this.mg_per_val = mg_per_val;
};
UnitInfo.prototype.calc_mg_per_val = function(weight, mgmL){
 var ret = this.mg_per_val;
 if(this.is_per_kg) ret *= weight;
 if(this.is_per_mL) ret *= mgmL;
 return ret;
}
var UnitInfoList = {};
UnitInfoList["mg"] = new UnitInfo(false, false, false, 1);
UnitInfoList["mg/kg"] = new UnitInfo(false, true, false, 1);
UnitInfoList["μg"] = new UnitInfo(false, false, false, 1/1000);
UnitInfoList["mL"] = new UnitInfo(false, false, true, 1);
UnitInfoList["mg/h"] = new UnitInfo(true, false, false, 1/60);
UnitInfoList["mg/kg/h"] = new UnitInfo(true, true, false, 1/60);
UnitInfoList["μg/kg/min"] = new UnitInfo(true, true, false, 1/1000);
UnitInfoList["μg/kg/h"] = new UnitInfo(true, true, false, 1/60/1000);
UnitInfoList["mL/h"] = new UnitInfo(true, false, true, 1/60);

UnitInfoList["ng/mL"] = new UnitInfo(true, false, false, 1/1000);
UnitInfoList["μg/mL"] = new UnitInfo(true, false, false, 1);

var AgentInfo = function(bolus_unit, infusion_unit, mgmL, y_scale_50, color){
 this.bolus_unit = bolus_unit;
 this.infusion_unit = infusion_unit;
 this.mgmL = mgmL;
 this.y_scale_50 = y_scale_50; // ng/mL at first horizontal line
 this.color = color;
 this.preset_model_arr = [];
 this.span_bolus = null;
 this.span_infusion = null;
}
var AgentInfoList = {};

AgentInfoList["Propofol"] = new AgentInfo("mg","mg/h", 10, 1000, "#0000ff"); // blue
AgentInfoList["Remimazolam"] = new AgentInfo("mg","mg/h", 1, 1000, "#800080"); // purple
AgentInfoList["Ketamine"] = new AgentInfo("mL","mL/h", 10, 100, "#008000"); //green
AgentInfoList["Dexmedetomidine"] = new AgentInfo("mL","μg/kg/h", 0.004, 1, "#008080"); //teal
AgentInfoList["Fentanyl"] = new AgentInfo("mL","mL/h", 0.05, 1, "#ff0000"); //red
AgentInfoList["Remifentanil"] =  new AgentInfo("mL","mL/h", 0.1, 1, "#808000"); // olive
AgentInfoList["Rocuronium"] =  new AgentInfo("mg","mg/h", 10,500, "#800000"); // maroon
AgentInfoList["Vecuronium"] =  new AgentInfo("mg","mg/h", 1,50, "#ff00ff"); // fuchsia

/* model */

var Model = function(){};
function model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke){
 var model = new Model();
 model.V1=V1; model.V2=V2; model.V3=V3; model.CL=CL; model.Q2=Q2; model.Q3=Q3; model.ke = ke;
 model.k10 = CL/V1; model.k12 = Q2/V1; model.k13 = Q3/V1; model.k21 = Q2/V2; model.k31 = Q3/V3;
 model.set_common();
 return model;
}
function model_from_k(k10,k12,k13,k21,k31,ke,V1){
 var model = new Model();
 model.k10=k10; model.k12=k12; model.k13=k13; model.k21=k21; model.k31=k31; model.ke = ke; model.V1 = V1;
 model.CL = k10*V1; model.Q2 = k12*V1; model.Q3 = k13*V1; model.V2 = model.Q2/k21; model.V3 = model.Q3/k31;
 model.set_common();
 return model;
}
Model.prototype.set_common = function(){
 var a = this.k10+this.k12+this.k13+this.k21+this.k31;
 var b = this.k10*(this.k21+this.k31)+this.k12*this.k31+this.k13*this.k21+this.k21*this.k31;
 var c = this.k10*this.k21*this.k31;
 this.eigen = solve3(a,b,c);
};
function model_from_eigen(eigen,V1,V123,CL,ke){
 var b = -V1/CL*(V123/CL*eigen[0]*eigen[1]*eigen[2]+eigen[0]*eigen[1]+eigen[1]*eigen[2]+eigen[2]*eigen[0]),
 c = -V1/CL*eigen[0]*eigen[1]*eigen[2],
 sqrtD = Math.sqrt(b*b-4*c);
 var k21 = (-b+sqrtD)/2,
 k31 = (-b-sqrtD)/2,
 k12 = -(k21+eigen[0])*(k21+eigen[1])*(k21+eigen[2]) / (k21*k21+V1/CL*eigen[0]*eigen[1]*eigen[2]),
 k13 = -(k31+eigen[0])*(k31+eigen[1])*(k31+eigen[2]) / (k31*k31+V1/CL*eigen[0]*eigen[1]*eigen[2]),
 k10 = CL/V1;
 return model_from_k(k10,k12,k13,k21,k31,ke,V1);
}

// individual variance
function make_rands(n){
  var i,x = new Array(n);
  // 奇数次元の場合には、一つの要素については標準正規分布からサンプリングする
  if (n % 2 === 1) {
    x[0] = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    for (i = 1; i < n; i += 2) {
      var r = Math.sqrt(-2 * Math.log(1-Math.random()));
      var theta = 2 * Math.PI * Math.random();
      x[i] = r * Math.cos(theta);
      x[i+1] = r * Math.sin(theta);
    }
  } else { // 偶数次元の場合には、2つの要素について同時にサンプリングする
    for (i = 0; i < n; i += 2) {
      var r = Math.sqrt(-2 * Math.log(Math.random()));
      var theta = 2 * Math.PI * Math.random();
      x[i] = r * Math.cos(theta);
      x[i+1] = r * Math.sin(theta);
    }
  }
  return x;
}
function multi_lognormal(e,L,rands) { // e:mean L:cholesky matrix
  if (rands.length<e.length){console.log("error_at_multi_lognormal");return;}
  var n = e.length; var i,j;
  var y = new Array(n);
  // 乱数を変換して、平均値と共分散行列に従う多変量正規分布からの乱数を生成する
  for (i = 0; i < n; i++) {
    y[i] = e[i];
    for (j = 0; j < n; j++) {
      y[i] += L[i][j] * rands[j];
    }
  }
  for(i=0;i<n;i++)y[i]=Math.exp(y[i]);
  return y;
}

function lognormal(E,CV){
 var S = E*CV, s = Math.sqrt(Math.log(S*S+1)), m = Math.log(E) - s*s/2;
 return Math.exp(m+s*rnorm())
}

var model_P_E2018 = function(patient){ // Eleveld 2018 (ignore terms of maturation, assume presence of opiates)
 var theta = [0,6.28,25.5,273,1.79,1.75,1.11,0.191,42.3,9.06,-0.0156,-0.00286,33.6,-0.0138,68.3,2.10,1.30,1.42,0.68]
 theta_pd = [0,2.91,0.121,92.3,1.44,7.59,0.0499,-0.00917,0.87,1.83],
 fcentral = function(x){ return x/(x+theta[12]); },
 FFM = patient.FFM_AS,
 FFMref = (0.88+(1-0.88)/(1+Math.pow(35/13.4,-12.7)))*(9270*70/(6680+216*70*10000/(170*170))),
 V1 = theta[1] * fcentral(patient.weight)/fcentral(70),
 V2 = theta[2] * patient.weight/70 * Math.exp(theta[10]*(patient.age-35)),
 V3 = theta[3] * FFM/FFMref * Math.exp(theta[13]*(patient.age-35)),
 CL = (patient.sex==0?theta[4]:theta[15])*Math.pow(patient.weight/70,0.75)*Math.exp(theta[11]*patient.age),
 Q2 = theta[5] * Math.pow(patient.weight/70 * Math.exp(theta[10]*(patient.age-35)),0.75),
 Q3 = theta[6] * Math.pow(patient.weight/70 * Math.exp(theta[13]*(patient.age-35)),0.75),
 ke = theta_pd[2] * Math.pow(patient.weight/70,-0.25);
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke);
};

var model_P_A2005 = function(patient){ // Absalom,2005, Paedfusor
 if(patient.age > 16){return model_from_VQ(0,0,0,0,0,0,0);} // this model not applicable
 var k10 = 0.1527*Math.pow(patient.weight,-0.3);
 var V1 = 0.4584*patient.weight;
 if(patient.age == 13){ V1 = 0.4000*patient.weight; k10 = 0.0678;}
 else if(patient.age == 14){ V1 = 0.342*patient.weight; k10 = 0.0792; }
 else if(patient.age == 15){ V1 = 0.284*patient.weight; k10 = 0.0954; }
 else if(patient.age == 16){ V1 = 0.22857*patient.weight; k10 = 0.119; }
 return model_from_k(k10, 0.114, 0.0419, 0.055, 0.0033, 0.26, V1);
}

var model_P_M1991 = function(patient){ // Marsh,1991 & Diprifusor
 return model_from_k(0.119, 0.112, 0.0419, 0.055, 0.0033, 0.260, 0.228*patient.weight);
}
var model_RMZ_M2022 = function(patient){ // Masui, 2022
 var age = patient.age; var sex = patient.sex; var ABW = patient.ABW; var high_ASA = patient.high_ASA;
 var theta = [0, 3.57, 11.3, 27.2, 1.03, 1.10, 0.401, 1.19, 0.308, 0.146, -0.184, 0.0205];
 var V1 = theta[1]*ABW/67.3;
 var V2 = theta[2]*ABW/67.3;
 var V3 = (theta[3]+theta[8]*(age-54))*ABW/67.3;
 var CL = (theta[4]+theta[9]*sex*theta[10]*(high_ASA?1:0)) * Math.pow(ABW/67.3,0.75);
 var Q2 = theta[5] * Math.pow(ABW/67.3,0.75);
 var Q3 = theta[6] * Math.pow(ABW/67.3,0.75);
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,0.22);
}
var model_RMZ_D2014 = function(patient){
 return model_from_eigen([Math.log(1/2)/0.62,Math.log(1/2)/10,Math.log(1/2)/47], 0.044*patient.weight, 0.53*patient.weight, 0.0174*patient.weight, 0);
// equivalent to model_from_k(0.3954545454545455,0.4931482469720125,0.1612302782489611,0.1299739456706474,0.02223483754595047,0,0.044*patient.weight);
}
var model_K_K2020 = function(patient){ // Kamp, 2020
 var V1 = 21 * patient.weight/70,
 V2 = 46 * patient.weight/70,
 V3 = 254 * patient.weight/70,
 CL = 79 * Math.pow(patient.weight/70,0.75) / 60, /* convert L/h to L/min */
 Q2 = 97 * Math.pow(patient.weight/70,0.75) / 60,
 Q3 = 60 * Math.pow(patient.weight/70,0.75) / 60;
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,0);
}
var model_DEX_M2020 = function(patient){ // Morse, 2020
 var FFM_AS = patient.FFM_AS,
 V1 = 25.2 * FFM_AS/70,
 V2 = 34.4 * FFM_AS/70,
 V3 = 65.4 * FFM_AS/70,
 CL = 0.897 * Math.pow(FFM_AS/70, 0.75),
 Q2 = 1.68 * Math.pow(FFM_AS/70, 0.75),
 Q3 = 0.62 * Math.pow(FFM_AS/70, 0.75);
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,0);
};
var model_DEX_H2015 = function(patient){ // Hannivoort, 2015
 var V1 = 1.78 * patient.weight/70,
 V2 = 30.3 * patient.weight/70,
 V3 = 52 * patient.weight/70,
 CL = 0.686 * Math.pow(patient.weight/70, 0.75),
 Q2 = 2.98 * Math.pow(V2/30.3, 0.75),
 Q3 = 0.602 * Math.pow(V3/52, 0.75);
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,0);
};
var model_F_B2020 = function(patient){ // Bae, 2020
 var V1 = 10.1 * Math.pow(patient.weight/70,1.23),
 V2 = 26.5 * Math.pow(patient.weight/70,1.23),
 V3 = 206 * Math.pow(patient.weight/70,1.23),
 CL = 0.704 * Math.pow(patient.weight/70, 0.313),
 Q2 = 2.38 * Math.pow(patient.weight/70, 0.313),
 Q3 = 1.49 * Math.pow(patient.weight/70, 0.313);
 ke = 0.147;
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke);
};

var model_F_B2020_rand = function(patient,rands){
// log-normal distribution of inter-individual random variability was assumed (Bae, 2020)
 var e = [ 2.15455974,  3.10460234,  5.27022279, -0.39649572,  0.7091248 , 0.31503616];
 var L = [[ 0.56209552,  0,  0,  0,  0, 0],
       [ 0.38128438,  0.4468859 ,  0,  0,  0, 0],
       [ 0.13190503,  0.10958652,  0.29308466,  0,  0, 0],
       [ 0.06844231, -0.0362393 , -0.01384428,  0.2912873 ,  0, 0],
       [ 0.29795635,  0.26713812, -0.07144489,  0.02714873,  0.38725855, 0],
       [ 0.13190503, -0.23036956, -0.00769307,  0.00729961,  0.29057677, 0.11164016]];
 var theta = multi_lognormal(e,L,rands);
 var V1 = theta[0] * Math.pow(patient.weight/70,1.23),
 V2 = theta[1] * Math.pow(patient.weight/70,1.23),
 V3 = theta[2] * Math.pow(patient.weight/70,1.23),
 CL = theta[3] * Math.pow(patient.weight/70, 0.313),
 Q2 = theta[4] * Math.pow(V2/30.3, 0.313),
 Q3 = theta[5] * Math.pow(V3/52, 0.313);
 ke = 0.147;
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke);
}

var model_F_S1990 = function(patient){ // Shafer,1990
  return model_from_k(0.083,0.471,0.225,0.102,0.006,0.114,0.105*patient.weight);
};
var model_RF_E2017 = function(patient){ // Eleveld, 2017
 var FFM_AS = patient.FFM_AS,
 FFMref = (0.88+(1-0.88)/(1+Math.pow(35/13.4,-12.7)))*(9270*70/(6680+216*70*10000/(170*170))),
 Fsize = FFM_AS / FFMref,
 Fsigmoid = function(x,b,c){return Math.pow(x,c)/(Math.pow(x,c)+Math.pow(b,c));},
 Fsex = patient.sex==0?1:1+0.47*Fsigmoid(patient.age,12,6) * (1-Fsigmoid(patient.age,45,6)),
 V1 = 5.81*Fsize*Math.exp(-0.00554*(patient.age-35)),
 V2 = 8.82*Fsize*Math.exp(-0.00327*(patient.age-35)) * Fsex,
 V3 = 5.03*Fsize*Math.exp(-0.0315*(patient.age-35)) * Math.exp(-0.0260*(patient.weight-70)),
 CL = 2.58*Math.pow(Fsize,0.75)*Math.exp(-0.00554*(patient.age-35)) * Fsex,
 Q2 = 1.72*Math.pow(V2/8.82,0.75)*Math.exp(-0.00554*(patient.age-35)) * Fsex,
 Q3 = 0.124*Math.pow(V3/5.03,0.75)*Math.exp(-0.00554*(patient.age-35)),
 ke = 1.09*Math.exp(-0.00289*(patient.age-35));
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke);
}
var model_RF_K2017 = function(patient){ // Kim, 2017
 var V1 = 4.76*Math.pow(patient.weight/74.5,0.658),
  V2 = 8.4*Math.pow(patient.FFM_j/52.3,0.573)-0.0936*(patient.age-37),
  V3 = 4-0.0477*(patient.age-37),
  CL = 2.77*Math.pow(patient.weight/74.5,0.336)-0.0149*(patient.age-37),
  Q2 = 1.94-0.0280*(patient.age-37),
  Q3 = 0.197,
  ke = 0;
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke);
}
var model_RF_M1997 = function(patient){ // Minto,1997
 var V1 = 5.1-0.0201*(patient.age-40)+0.072*(patient.LBM-55),
  V2 = 9.82-0.0811*(patient.age-40)+0.108*(patient.LBM-55),
  V3 = 5.42,
  CL = 2.6-0.0162*(patient.age-40)+0.0191*(patient.LBM-55),
  Q2 = 2.05-0.0301*(patient.age-40),
  Q3 = 0.076-0.00113*(patient.age-40),
  ke = 0.595-0.007*(patient.age-40);
 return model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke);
}
var model_Rb_W1991 = function(patient){ // Wierda,1991
 return model_from_k(0.1,0.21,0.028,0.13,0.01, 0 ,0.045*patient.weight); 
}
var model_Vb_R1987_y = function(patient){ // Rupp,1987,younger
 return model_from_k(0.1,0.1436,0.0344,0.1102,0.0144, 0.169 ,0.052*patient.weight);
}
var model_Vb_R1987_o = function(patient){ // Rupp,1987,younger
 return model_from_k(0.0389,0.4368,0.107,0.0787,0.0039, 0.5923 ,0.029*patient.weight);
}

AgentInfoList["Propofol"].preset_model_arr = [
 {model_g: model_P_E2018, label: "Eleveld,2018"},
 {model_g: model_P_A2005, label: "Absalom,2005"},
 {model_g: model_P_M1991, label: "Marsh,1991"}
];
AgentInfoList["Remimazolam"].preset_model_arr = [
 {model_g: model_RMZ_M2022, label: "Masui,2022"},
 {model_g: model_RMZ_D2014, label: "Doi,2014"}
];
AgentInfoList["Ketamine"].preset_model_arr = [
 {model_g: model_K_K2020, label: "Kamp,2020"}
];
AgentInfoList["Dexmedetomidine"].preset_model_arr = [
 {model_g: model_DEX_M2020, label: "Morse,2020"},
 {model_g: model_DEX_H2015, label: "Hannivoort,2015"}
];
AgentInfoList["Fentanyl"].preset_model_arr = [
 {model_g: model_F_B2020, label: "Bae, 2020"},
 {model_g: model_F_S1990, label: "Shafer,1990"}
];
AgentInfoList["Remifentanil"].preset_model_arr = [
 {model_g: model_RF_E2017, label: "Eleveld,2017"},
 {model_g: model_RF_K2017, label: "Kim,2017"},
 {model_g: model_RF_M1997, label: "Minto,1997"}
];
AgentInfoList["Rocuronium"].preset_model_arr = [
 {model_g: model_Rb_W1991, label: "Wierda,1991"}
];
AgentInfoList["Vecuronium"].preset_model_arr = [
 {model_g: model_Vb_R1987_y, label: "Rupp,1987,younger"},
 {model_g: model_Vb_R1987_o, label: "Rupp,1987,older"}
];

Modelname2func = []; // used in load_data(), ex. Modelname2func["model_P_E2018"](..) = model_P_E2018(..)
(function(){
 var agent;
 for(agent in AgentInfoList){
  var arr = AgentInfoList[agent].preset_model_arr;
  var i; for(i=0;i<arr.length;i++){
   modelinfo = arr[i];
   Modelname2func[modelinfo.model_g.name] = modelinfo.model_g;
  } 
 }
})();

/* patient */

var Current_patient;

var Patient = function(age,sex,height,weight,high_ASA){
 /* sex: 0 (male) or 1 (female), height[cm], weight[kg], high_ASA: false (ASA-PS=1,2) or true (ASAPS=3,4) */
 this.age = age;
 this.sex = sex;
 this.height = height;
 this.BMI = weight * 10000 / (height * height);
 this.weight = weight;
 this.IBW = 45.4+0.89*(height-152.4)+4.5*(1-sex);
 this.ABW = this.IBW+0.4*(weight-this.IBW);
 this.LBM = sex==0? 1.1*weight-128*(weight/height)*(weight/height): 1.07*weight-148*(weight/height)*(weight/height);
 this.FFM_j = sex==0 ? 9270*weight/(6680+216*this.BMI) : 9270*weight/(8780+244*this.BMI); // Janmahasatian
 this.FFM_AS = sex==0 ? (0.88+(1-0.88)/(1+Math.pow(age/13.4,-12.7)))*this.FFM_j :
  (1.11+(1-1.11)/(1+Math.pow(age/7.1,-1.1)))*this.FFM_j; // Al Sallami et al.
 this.high_ASA = high_ASA;
 this.toJSON = function(){
  var i, output_keys = ["age","sex","height","weight","high_ASA"];
  var temp_object = {};
  for(i=0; i<output_keys.length; i++){
   var key = output_keys[i]; 
   temp_object[key] = this[key];
  }
  return temp_object;
 };
};
function load_patient(){ // eventually check validity
 var age = parseFloat(document.getElementById("age").value);
 if(age<0){ age=1; document.getElementById("age").value=1; }
 var weight = parseFloat(document.getElementById("weight").value);
 if(weight<0){ weight=1; document.getElementById("weight").value=1; }
 var height = parseFloat(document.getElementById("height").value);
 if(height<0){ height=1; document.getElementById("height").value=1; }
 var sex = parseFloat(document.getElementById("sex").value);
 var high_ASA = document.getElementById("high_ASA").value == "1";
 Current_patient = new Patient(age,sex,height,weight,high_ASA);
 document.getElementById("patient_info").innerHTML
 = "BMI:" + myPrecision(Current_patient.BMI)
  + ", IBW:" + myPrecision(Current_patient.IBW)
  + ", ABW:" + myPrecision(Current_patient.ABW)
  + ", LBM:" + myPrecision(Current_patient.LBM)
  + ", FFM<sub>j</sub>:" + myPrecision(Current_patient.FFM_j)
  + ", FFM<sub>AS</sub>:" + myPrecision(Current_patient.FFM_AS)
}

/* general operation */

function appear(x){document.getElementById(x).style.display = "block"; }
function disappear(x){document.getElementById(x).style.display = "none"; }
function appear_disappear(x){ document.getElementById(x).style.display =  document.getElementById(x).style.display != "block"?"block":"none";}
function setClass(x,y){ x.setAttribute("class",y);x.setAttribute("className",y); x.className=y;}
function setEvent(elem,key,func){
 if(elem.addEventListener){ elem.addEventListener(key, func, false); }
 else if(elem.attachEvent){ elem.attachEvent(key, func, false); }
}
function myPrecision(x){// my display style
 return isNaN(x)? "":x<-0.0001? "-"+myPrecision(-x): x>=100? x.toFixed(0):x>=10? x.toFixed(0)+".0"==x.toFixed(1)? x.toFixed(0): x.toFixed(1):
  x>=1? x.toFixed(0)+".00"==x.toFixed(2)? x.toFixed(0): x.toFixed(1)+"0"==x.toFixed(2)? x.toFixed(1): x.toFixed(2)
      : x<0.0001? "0":x.toPrecision(1)+"0"==x.toPrecision(2)? x.toPrecision(1): x.toPrecision(2);
}
function myPrecision_signed(x){ var ret = myPrecision(x); return ret>0? "+"+ret: ret; } // 0->"0"
function myPrecision_zerosigned(x){ var ret = myPrecision(x); return ret>=0? "+"+ret: ret; } // 0->"+0" 

function min2hm(t){
 if(t<0){ return "-"+min2hm(-t); }
 t = Math.floor(t);
 var h = Math.floor(t/60), m=t-h*60;
 return h + ":" + (m<10?"0"+m:m);
}
function hm2min(x){
 if(x.charAt(0)=="-"){ return -hm2min(x.substring(1)); }
 var hm = x.split(":");
 return hm.length==2? ( parseInt(hm[0])*60 + parseInt(hm[1]) ): NaN;
}
function ready(){ // onload function
 load_patient();
 canvas_ready();
 drug_arr_ready();
 compart_ready();
 W = document.body.clientWidth;
 canvas_resize();
 window.onresize = function(){
  W = document.body.clientWidth;
  canvas_resize();
 };
 changeLang(Lang);
}

/* sorted array */
// bisection method: https://note.affi-sapo-sv.com/js-insert-into-sorted-array.php

function insertValue2(val,array){
 var length = array.length;
 if( length === 0 || array[length-1] <= val ){
  array.push( val ); return length;
 }
 var left = 0,right = length;
 var index = Math.floor((left + right) / 2);
 while (right > left) {
  if(val < array[index]){ right = index; }
  else { left = index+1; }
  index = Math.floor((left + right) / 2);
 }
 array.splice(index, 0, val);
 return index;
}
function indexBelowValue2(val,array){
 var length = array.length;
 if( length === 0 || array[length-1] < val ){
  return length-1;
 }
 var left = 0, right = length;
 var index = Math.floor((left + right) / 2);
 while (right > left) {
  if(val < array[index]){ right = index; }
  else { left = index+1; }
  index = Math.floor((left + right) / 2);
 }
 return index - 1;
}
function deleteValue2(val,array){
 var length = array.length;
 var left=0,right = length;
 var index = Math.floor((left + right) / 2);
 while (right > left) {
  if (val==array[index]){
   array.splice(index, 1); return index;
  }
  if(val < array[index]){ right = index; }
  else { left = index+1; }
  index = Math.floor((left + right) / 2);
 }
}

/* algebra */

function solve3x3(a1,b1,c1,a2,b2,c2,a3,b3,c3,d1,d2,d3){ // solve ak*x+bk*y+ck*z=dk
 var D = a1*(b2*c3-b3*c2)+a2*(b3*c1-b1*c3)+a3*(b1*c2-b2*c1);
 var x = ( d1*(b2*c3-b3*c2)+d2*(b3*c1-b1*c3)+d3*(b1*c2-b2*c1) )/ D
 var y = ( a1*(d2*c3-d3*c2)+a2*(d3*c1-d1*c3)+a3*(d1*c2-d2*c1) )/ D
 var z = ( a1*(b2*d3-b3*d2)+a2*(b3*d1-b1*d3)+a3*(b1*d2-b2*d1) )/ D
return [x,y,z];}

function solve3(a,b,c){
// solve x^3+ax^2+bx+c=0
// Strum method, F0=[c,b,a,1]; F1=[b,2*a,3]; F2=[b*a-c*9, 2*a*a-6*b]; F3=[a*a*b*b-27*c*c-4*a*a*a*c-4*b*b*b+18*a*b*c];
 var D = (a*a*b*b-27*c*c-4*a*a*a*c-4*b*b*b+18*a*b*c);
 function strum_n(x){
  var f0x = c+x*(b+x*(a+x));
  var f1x = b+x*(2*a+3*x);
  var f2x = b*a-c*9 + x*(2*a*a-6*b);
  return (f0x*f1x<0?1:0) + (f1x*f2x<0?1:0) + (f2x*D<0?1:0);
 }
 var root = [];
 var stack = [];
 var lower = -a, upper=0, s_lower = strum_n(lower), s_upper=strum_n(upper);
 stack[0]=[lower,upper,s_lower,s_upper];
 var pointer=0;
 while(pointer>=0){
  var work = stack[pointer]
  lower = work[0];
  upper = work[1];
  var middle = (lower+upper)/2;
  s_lower = work[2];
  s_upper = work[3];
  if(s_upper==s_lower){ pointer--; continue; }
  if(upper-lower < Accuracy){
   var j;
   for(j=0;j<s_lower-s_upper;j++) root.push(middle);
   pointer--; continue;
  }
  s_middle = strum_n(middle);
  stack[pointer] = [lower,middle,s_lower,s_middle];
  stack[pointer+1] = [middle,upper,s_middle,s_upper];
  pointer++;
 }
 return root;
}

var Linexp = function(arr){
 this.c = {};
 this.t = t_MIN;
 this.k_arr = [];
 if(arr){ this.add(arr); }
}
// express Σc[k][q]*t^q*exp(k*(t-this.t))

Linexp.prototype.add = function(arr){
 var ai, aN=arr.length;
 for(ai=0;ai<aN;ai++){ this.add_term(arr[ai]); }
}
Linexp.prototype.addlinexp = function(obj){
 for(K in obj.c){
  this.add_term({k:K, c:obj.c[K].concat(), t:obj.t});
}}
Linexp.prototype.add_term = function(obj){
 var k = obj.k;
 var c = obj.c; // array
 var t = obj.t===undefined? this.t: obj.t;
 var ci;
 if(this.c[k]){
  if(this.t > t){
   for(ci=0;ci<c.length;ci++){
    c[ci] *= Math.exp( parseFloat(k) * (this.t - t) );
  }}
  else if(this.t < t){
   for(ci=0;ci<this.c[k].length;ci++){
    this.c[k][ci] *= Math.exp(parseFloat(k) * (t - this.t) );
   }
   this.t = t;
  }
  for(ci=0;ci<this.c[k].length;ci++){
   if(c[ci])this.c[k][ci] += c[ci];
  }
  for(;ci<c.length;ci++){
   if(c[ci])this.c[k][ci] = c[ci];
  }
 } else {
  this.c[k] = c.concat();
  this.t = t;
  insertValue2( k, this.k_arr );
 }
}
Linexp.prototype.scaler = function(s){
 var ret = new Linexp([]);
 ret.t = this.t;
 for(K in this.c){
  var c = this.c[K].concat();
  var C = [];
  for(ci=c.length-1; ci>=0; ci--){
   C[ci] = c[ci] * s;
  }
  ret.add_term({k:K,c:C});
 }
 return ret;
}
Linexp.prototype.diff = function(){
 var ret = new Linexp([]);
 ret.t = this.t;
 for(K in this.c){
  var c = this.c[K].concat();
  var k = parseFloat(K);
  var C = [];
  for(ci=c.length-1; ci>=0; ci--){
   C[ci] = c[ci] * k;
   if(ci>=1){ C[ci-1] += c[ci]*ci; }
  }
  ret.add_term({k:K,c:C});
 }
 return ret;
}
Linexp.prototype.integrate = function(){
 var ret = new Linexp([]);
 ret.t = this.t;
 for(K in this.c){
  var c = this.c[K].concat();
  var k = parseFloat(K);
  var C = [0];
  if(Math.abs(k) < Accuracy){
   for(ci=c.length-1; ci>=0; ci--){
    C[ci+1] = c[ci]/(ci+1);
  }} else {
   for(ci=c.length-1; ci>=0; ci--){
    C[ci] = c[ci] / k;
    if(ci>=1){ c[ci-1] -= C[ci]*ci; }
    if(ci==0){ ret.add_term({k:0, c:[-c[ci] / k]}) }
   }
  }
  ret.add_term({k:K,c:C});
 }
 return ret;
}
Linexp.prototype.calc_at = function(t){
 var ci,ret = 0;
 for(K in this.c){
  var k = parseFloat(K);
  for(ci=0;ci<this.c[K].length;ci++){
   ret += this.c[K][ci] * Math.pow(t-this.t, ci) * Math.exp(k*(t-this.t));
 }}
 return ret;
}
Linexp.prototype.display = function(){
 var ci,ki,kN = this.k_arr.length, ret="";
 if(!kN){return "";}
 for(ki = kN-1; ki>=0; ki--){
  var k = this.k_arr[ki];
  for(ci=0; ci<this.c[k].length; ci++){
   if( Math.abs(this.c[k][ci]) > Accuracy){
    ret += ( ret? myPrecision_zerosigned(this.c[k][ci]): myPrecision(this.c[k][ci]) )
     + ( ci>1? "t^"+ci: ci==1? "t" : "")
     + ( Math.abs(k)>Accuracy?  "e<sup>-t/"+myPrecision(-1/parseFloat(k)) + "</sup>" : "");
   }
  }
 }
 return ret;
}

/* row and labelinfo management */

var LabelInfo = function(agent){
 this.agent = agent;
 this.mgmL = AgentInfoList[agent].mgmL;
 this.y_scale_50 = AgentInfoList[agent].y_scale_50; // ngmL at 50px
 this.color = AgentInfoList[agent].color;
 this.preset_model_g = AgentInfoList[agent].preset_model_arr[0].model_g;
 this.row_arr = [];
 this.model_arr = [];
 this.model_at = {};
 this.compart_label_div = null;
 this.toJSON = function(){
  var i, output_keys = ["agent","mgmL","y_scale_50","color","model_at","row_arr"];
  var temp_object = {};
  for(i=0; i<output_keys.length; i++){
   var key = output_keys[i]; 
   temp_object[key] = this[key];
  }
  if( this.preset_model_g ){temp_object.preset_model_g = this.preset_model_g.name;}
  return temp_object;
 };
}
var LabelInfoList = {};
var Row_arr = [];
var Row = function(){
 this.n = Row_arr.length; // ? Row_arr[Row_arr.length-1].n + 1 : 0; // id
 var dosearea_div = document.createElement('div');
 document.getElementById("row_container").appendChild(dosearea_div);
 dosearea_div.style.top = this.n*row_H + "px";
 dosearea_div.style.minWidth = W + "px";
 dosearea_div.style.height = row_H - 1 + "px";
 dosearea_div.setAttribute("n", this.n);
 if(this.n==0){
  dosearea_div.innerHTML = '--- <span lang="ja" n="0">シミュレーション開始にはここをクリック</span><span lang="en" n="0">Click here for simulation</span> ---';
  dosearea_div.style.textAlign = "center";
 }
 setClass(dosearea_div, "dosearea");
 setEvent(dosearea_div, "click", dosearea_click)
 setEvent(dosearea_div, "mousemove", dosearea_mousemove)
 setEvent(dosearea_div, "mouseout", cursor_delete)
 setEvent(dosearea_div, "touchstart", dosearea_touchstart)
 setEvent(dosearea_div, "touchmove", dosearea_touchmove)
 setEvent(dosearea_div, "touchend", dosearea_touchend)
 this.dosearea_div = dosearea_div;
 this.labelarea_div = null;
 this.agent = "";
 this.label = "";
 this.unit = "";
 this.unit_span = null;
 this.labelinfo = null;
 this.entry_arr = [];
 this.entry_at = {};
 this.div_arr = [];
 this.div_at = {};
 Row_arr.push(this); 
 this.toJSON = function(){
  var i, output_keys = ["unit","entry_at"];
  var temp_object = {};
  for(i=0; i<output_keys.length; i++){
   var key = output_keys[i];
   temp_object[key] = this[key];
  }
  if( this.TCI_model_g ){temp_object.TCI_model_g = this.TCI_model_g.name;}
  return temp_object;
 };
}
function label_click(e){
 var div = e.target;
 var n = parseInt(div.getAttribute("n"));
 var row = Row_arr[n];
 if(row.labelinfo.preset_model_g == model_P_A2005 || row.TCI_model_g == model_P_A2005 ){
  if( Current_patient.age>16 && row.labelarea_div.className == "labelarea_off" ) {
   alert(Lang=="en"?"This model is only valid for age≦16":"このモデルは16歳以下のみ有効です");return;
 }}
 setClass(row.dosearea_div, div.className == "labelarea_off"? "dosearea": "dosearea_off");
 setClass(div, div.className == "labelarea_off"? "labelarea_on": "labelarea_off");
 update_graph();
}
Row.prototype.register = function(label, unit_span){
 this.agent = unit_span.getAttribute("agent");
 this.label = label;
 this.unit_span = unit_span; // botton in pop_up
 this.unit = unit_span.innerHTML;
 if(this.dosearea_div.innerHTML.substring(0,3) == "---"){ this.dosearea_div.innerHTML = ""; }
 if(!this.labelarea_div){
  var labelarea_div = document.createElement('div');
  setClass(labelarea_div, "labelarea_on");
  labelarea_div.style.top = this.n*row_H + "px";
  labelarea_div.style.height = row_H - 6 + "px";
  labelarea_div.setAttribute("n",this.n);
  labelarea_div.onclick = label_click;
  this.labelarea_div = labelarea_div;
  document.getElementById("row_container").appendChild(labelarea_div);
 }
 if(!LabelInfoList[label]){
  this.labelinfo = LabelInfoList[label] = new LabelInfo(this.agent);
  this.labelinfo.compart_label_div = create_compart_label_div(label);
 }
 else{
  this.labelinfo = LabelInfoList[label];
 }
 if(!Compart.div)set_compart(this.labelinfo.compart_label_div);
 this.labelinfo.row_arr.push(this);
}
LabelInfo.prototype.delete_rowdata = function(row){
 var i;
 for(i=this.row_arr.length-1;i>=0;i--){
  if(this.row_arr[i] === row){
   this.row_arr.splice(i,1);
 }}
 if(this.row_arr.length==0){
  var label = this.compart_label_div.innerHTML;
  delete_compart_label_div(this.compart_label_div);
  delete LabelInfoList[label];
 }
}
Row.prototype.delete = function(){ // delete this
 this.labelinfo.delete_rowdata(this);
 for(i = this.n;i<Row_arr.length-1;i++){
  Row_arr[i] = Row_arr[i+1];
  Row_arr[i].n = i;
 }
 Row_arr.pop();
};
Row.prototype.change_label = function(new_label){
 var old_labelinfo = this.labelinfo;
 this.label = new_label;
 old_labelinfo.delete_rowdata(this);
 this.register(new_label, this.unit_span);
 for(time in this.div_at){
  var div = this.div_at[time];
  if(div.style.color=="red"){
   this.labelinfo.model_at[time] = old_labelinfo.model_at[time];
   insertValue2(time, this.labelinfo.model_arr);
   delete(old_labelinfo.model_at[time])
   deleteValue2( time, old_labelinfo.model_arr);
  }
 }
}
LabelInfo.prototype.add_model = function(time, model){
// overwrite model change in other rows at the same time
 var ri,rN = this.row_arr.length;
 for(ri=0; ri<rN; ri++){
  var div = this.row_arr[ri].div_at[time];
  if(div && div.style.color=="red"){
   div.style.color="black";
   if(div.innerHTML=="c"){div.parentElement.removeChild(div);}
  }
 }
 this.model_at[time] = model;
 insertValue2(time, this.model_arr);
}
Row.prototype.add_data = function(time, dose, model, div){
 var dose_disp = "c"; // case only model change
 if(!isNaN(dose)){
  this.entry_at[time] = dose;
  insertValue2( time, this.entry_arr);
  dose_disp = dose+"";
  if( dose<0.1 && dose_disp.length > 5){ dose_disp = dose.toPrecision(3);} // ?
  if(UnitInfoList[this.unit].is_infusion){
   if(dose==0){ dose_disp = "/"; }
   else{ dose_disp += "-"; }
  }
 }
 if(model){
  this.labelinfo.add_model(time, model);
 }
 if(!div){
  div = document.createElement('div');
  setClass(div, "dose_each");
  setEvent(div, "click", entry_click );
  setEvent(div, "mouseover", entry_mousemove );
  div.style.position = "absolute";
 }
 this.div_at[time] = div;
 div.innerHTML = dose_disp;
 div.setAttribute("time", time);
 div.style.color = model? "red": "black"; // clarify entry with model change by red color
 div.style.left = parseInt( t2x(time) ) + "px";
 var idx = insertValue2(time, this.div_arr);
 this.dosearea_div.insertBefore(div, this.div_at[this.div_arr[idx+1]] || null);
};
Row.prototype.delete_data = function(time){
 delete(this.entry_at[time])
 delete(this.labelinfo.model_at[time])
 delete(this.div_at[time])
 deleteValue2( time, this.entry_arr);
 deleteValue2( time, this.labelinfo.model_arr);
 deleteValue2( time, this.div_arr);
};
Row.prototype.update_value = function(new_unit, new_mgmL){
 var t;
 var old_mgmL = LabelInfoList[this.label].mgmL;
 var old_unit = this.unit;
 for(t in this.entry_at){
  var val = this.entry_at[t];
  var mg = val * UnitInfoList[old_unit].calc_mg_per_val(Current_patient.weight, old_mgmL);
  var new_val = mg / UnitInfoList[new_unit].calc_mg_per_val(Current_patient.weight, new_mgmL);
  this.entry_at[t] = new_val;
 }
 for(time in this.div_at){
  var div = this.div_at[time];
  if(this.entry_at[time]!==undefined){
   div.innerHTML = UnitInfoList[this.unit].is_infusion && this.entry_at[time]==0? "/":
    myPrecision(this.entry_at[time]) + (UnitInfoList[this.unit].is_infusion && this.entry_at[time]?"-":"");
 }}
};

/* main simulation */

var t_MIN = -999999999999999, t_MAX = 999999999999999;
/* Number.MIN_SAFE_INTEGER does not work in old browser */

Model.prototype.formula_2_1 = function(i){ // k==a_i
 var e = [this.eigen[i], this.eigen[(i+1)%3], this.eigen[(i+2)%3]];
 var a10 = (
  (this.k21+e[1])*(this.k31+e[1])/((e[1]-e[0])*(e[1]-e[0]))
 -(this.k21+e[2])*(this.k31+e[2])/((e[2]-e[0])*(e[2]-e[0]))
 ) /(e[2]-e[1]);
 var a20 = (
  this.k21*(this.k31+e[1])/((e[1]-e[0])*(e[1]-e[0]))
 -this.k21*(this.k31+e[2])/((e[2]-e[0])*(e[2]-e[0]))
 ) / (e[2]-e[1]);
 var a30 = (
  (this.k21+e[1])*this.k13/((e[1]-e[0])*(e[1]-e[0]))
 -(this.k21+e[2])*this.k13/((e[2]-e[0])*(e[2]-e[0]))
 ) / (e[2]-e[1]);
 var a11 = (this.k21*e[0])*(this.k31+e[0])/((e[1]-e[0])*(e[2]-e[0]));
 var a21 = this.k12*(this.k31+e[0])/((e[1]-e[0])*(e[2]-e[0]));
 var a31 = this.k13*(this.k31+e[0])/((e[1]-e[0])*(e[2]-e[0]));
 return [a10,a11,a20,a21,a30,a31];
}
Model.prototype.formula_2_2 = function(k){
 var pk = k*k*k + (this.k10+this.k12+this.k13+this.k21+this.k31)*k*k
  +(this.k10*this.k21+this.k10*this.k31+this.k12*this.k31+this.k13*this.k21+this.k21*this.k31)*k + this.k10*this.k21*this.k31;
 var a10 = (k+this.k21)*(k+this.k31)/pk;
 var a20 = (this.k12)*(k+this.k31)/pk;
 var a30 = (k+this.k21)*(this.k13)/pk;
 return [a10,0,a20,0,a30,0];
}
Model.prototype.simulate = function(infusion,initial){ // Linexp, state(C1,C2,C3,Ce)
 var t = infusion.t;
 var A1 = new Linexp([{k:0,c:[0],t:t}]);
 var A2 = new Linexp([{k:0,c:[0],t:t}]);
 var A3 = new Linexp([{k:0,c:[0],t:t}]);
// assume infusion.c[k][ci]=0 for ci>0, this.eigens are distinct
 var b123 = [0,0,0]; // value of A1,A2,A3 at t=0 during calculation
/* step 2-1, calculate terms for exponential infusion B*exp(k*t) */
 for(K in infusion.c){
  var k = parseFloat(K);
  if( Math.abs(k) < Accuracy ){ continue; } // terms for constant infusion are dealt later
  var B = infusion.c[K][0];
  var aij;
  if( Math.abs(k-this.eigen[0]) < 2*Accuracy){ aij =  this.formula_2_1(0); } // case 2-1-1, k==eigen[0]
  else if( Math.abs(k-this.eigen[1]) < 2*Accuracy){ aij =  this.formula_2_1(1); } // case 2-1-1, k==eigen[1]
  else if( Math.abs(k-this.eigen[2]) < 2*Accuracy){ aij =  this.formula_2_1(2); } // case 2-1-1, k==eigen[2]
  else{ aij =  this.formula_2_2(k); }  // case 2-1-2, k!=e1,e2,e3
  A1.add_term({k:K, c:[B*aij[0],B*aij[1]] });
  A2.add_term({k:K, c:[B*aij[2],B*aij[3]] });
  A3.add_term({k:K, c:[B*aij[4],B*aij[5]] });
  b123[0] += B*aij[0];
  b123[1] += B*aij[2];
  b123[2] += B*aij[4];
 }
/* step 2-2, add terms for constant infusion, satisfying the initial condition */
// var equib_A1=0,equib_A2=0,equib_A3=0,linear_A1=0,linear_A2=0,linear_A3=0;
 var constant_infusion = infusion.c[0] && infusion.c[0][0] || 0;
 if( Math.abs(this.k10) < Accuracy){ // no clearance (then, eigen[0]==0)
  // var initial_total = initial.C1*this.V1 + initial.C2*this.V2 + initial.C3*this.V3;
  var V123 = this.V1+this.V2+this.V3;
  var extra2 = constant_infusion*this.V2/this.k21/V123;
  var extra3 = constant_infusion*this.V3/this.k31/V123;
  var linear_A1 = constant_infusion * this.V1 / V123;
  var linear_A2 = constant_infusion * this.V2 / V123;
  var linear_A3 = constant_infusion * this.V3 / V123;
  if( Math.abs(this.k21 - this.k31) < Accuracy){ // case 2-2-1, k21==k31 (then, eigen[1]==eigen[2]==-k21)
   var c20=this.k12/(this.k21), c22=this.k12/(this.eigen[2]+this.k21);
   var c30=this.k13/(this.k31), c32=this.k13/(this.eigen[2]+this.k31);
   var coeffs = solve3x3(1,0,1,c20,1,c22,c30,-1,c32,
    initial.C1*this.V1-b123[0],
    initial.C2*this.V2-b123[1] + extra2,
    initial.C3*this.V3-b123[2] + extra3);
   A1.add([ {k:0, c:[coeffs[0], linear_A1]}, {k:this.eigen[2], c:[coeffs[2]]} ]);
   A2.add([ {k:0, c:[coeffs[0]*c20 - extra2, linear_A2]}, {k:this.eigen[1], c:[coeffs[1]]}, {k:this.eigen[2], c:[coeffs[2]*c22]} ]);
   A3.add([ {k:0, c:[coeffs[0]*c30 - extra3, linear_A3]}, {k:this.eigen[1], c:[-coeffs[1]]}, {k:this.eigen[2], c:[coeffs[2]*c32]} ]);
  } else{ // case 2-2-2, k21!=k31
   var c20=this.k12/this.k21, c21=this.k12/(this.eigen[1]+this.k21), c22=this.k12/(this.eigen[2]+this.k21);
   var c30=this.k13/this.k31, c31=this.k13/(this.eigen[1]+this.k31), c32=this.k13/(this.eigen[2]+this.k31);
   var coeffs = solve3x3(1,1,1,c20,c21,c22,c30,c31,c32,
    initial.C1*this.V1-b123[0],
    initial.C2*this.V2-b123[1] + extra2,
    initial.C3*this.V3-b123[2] + extra3 );
   A1.add([ {k:0, c:[coeffs[0], linear_A1]}, {k:this.eigen[1], c:[coeffs[1]]}, {k:this.eigen[2], c:[coeffs[2]]} ]);
   A2.add([ {k:0, c:[coeffs[0]*c20 - extra2, linear_A2]}, {k:this.eigen[1], c:[coeffs[1]*c21]}, {k:this.eigen[2], c:[coeffs[2]*c22]} ]);
   A3.add([ {k:0, c:[coeffs[0]*c30 - extra3, linear_A3]}, {k:this.eigen[1], c:[coeffs[1]*c31]}, {k:this.eigen[2], c:[coeffs[2]*c32]} ]);
  }
 }
 else{ // with clearance
  var equib_A1 = constant_infusion / this.k10;
  var equib_A2 = equib_A1 * this.k12 / this.k21;
  var equib_A3 = equib_A1 * this.k13 / this.k31;
  if( Math.abs(this.k21 - this.k31) < Accuracy){ // case 2-2-1, k21==k31 (then, e2==-k21)
   var c20=this.k12/(this.eigen[0]+this.k21), c22=this.k12/(this.eigen[2]+this.k21);
   var c30=this.k13/(this.eigen[0]+this.k31), c32=this.k13/(this.eigen[2]+this.k31);
   var coeffs = solve3x3(1,0,1,c20,1,c22,c30,-1,c32,
    -equib_A1+initial.C1*this.V1-b123[0], -equib_A2+initial.C2*this.V2-b123[1], -equib_A3+initial.C3*this.V3-b123[2]);
   A1.add([ {k:0, c:[equib_A1]}, {k:this.eigen[0], c:[coeffs[0]]}, {k:this.eigen[2], c:[coeffs[2]]} ]);
   A2.add([ {k:0, c:[equib_A2]}, {k:this.eigen[0], c:[coeffs[0]*c20]}, {k:this.eigen[1], c:[coeffs[1]]}, {k:this.eigen[2], c:[coeffs[2]*c22]} ]);
   A3.add([ {k:0, c:[equib_A3]}, {k:this.eigen[0], c:[coeffs[0]*c30]}, {k:this.eigen[1], c:[-coeffs[1]]}, {k:this.eigen[2], c:[coeffs[2]*c32]} ]);
  } else{ // case 2-2-2, k21!=k31
   var c20=this.k12/(this.eigen[0]+this.k21), c21=this.k12/(this.eigen[1]+this.k21), c22=this.k12/(this.eigen[2]+this.k21);
   var c30=this.k13/(this.eigen[0]+this.k31), c31=this.k13/(this.eigen[1]+this.k31), c32=this.k13/(this.eigen[2]+this.k31);
   var coeffs = solve3x3(1,1,1,c20,c21,c22,c30,c31,c32,
    -equib_A1+initial.C1*this.V1-b123[0], -equib_A2+initial.C2*this.V2-b123[1], -equib_A3+initial.C3*this.V3-b123[2]);
   A1.add([ {k:0, c:[equib_A1]}, {k:this.eigen[0], c:[coeffs[0]]}, {k:this.eigen[1], c:[coeffs[1]]}, {k:this.eigen[2], c:[coeffs[2]]} ]);
   A2.add([ {k:0, c:[equib_A2]}, {k:this.eigen[0], c:[coeffs[0]*c20]}, {k:this.eigen[1], c:[coeffs[1]*c21]}, {k:this.eigen[2], c:[coeffs[2]*c22]} ]);
   A3.add([ {k:0, c:[equib_A3]}, {k:this.eigen[0], c:[coeffs[0]*c30]}, {k:this.eigen[1], c:[coeffs[1]*c31]}, {k:this.eigen[2], c:[coeffs[2]*c32]} ]);
  }
 }
 var C1 = A1.scaler(1/this.V1);
 var C2 = A2.scaler(1/this.V2);
 var C3 = A3.scaler(1/this.V3);
/* step 3, simulate Ce */
 var b_e = initial.Ce;
 var Ce = new Linexp([ {k:0, c:[0], t:t} ]);
 for(K in C1.c){
  var k = parseFloat(K);
  var B = C1.c[K][0], C = C1.c[K][1] || 0;
  if( Math.abs( k - (-this.ke)) < 2*Accuracy ){ // case 3-1-1, k==-ke
   var ci,C = [0];
   for(ci=0;ci<C1.c[K].length;ci++){
    C[ci+1] = C1.c[K] * this.ke/(ci+1);
   }
   Ce.add_term({k:K, c:C});
  }
  else{ // 3-1-2, k!=-ke, including k==0
   var ci, c=C1.c[K].concat(), C = [];
   for(ci=c.length-1; ci>=0; ci--){
    C[ci] = c[ci] * this.ke / (this.ke + k);
    if(ci){ c[ci-1]-= ci*C[ci]/this.ke; }
   }
   Ce.add_term({k:K, c:C});
   b_e -= C[0];
  }
 }
 Ce.add_term({k:-this.ke, c:[b_e]}); // 3-2, term for satisfying initial condition
 var total = infusion.integrate();
 total.add_term({ k:0, c:[initial.total] });
 var sol = new Solution({time:t, Ce:Ce, C1:C1, C2:C2, C3:C3, infusion:infusion, total:total, model:this});
 return sol;
}

function give_solution(t, initial, infusion_rate, model){
 var infusion = new Linexp([{k:0, c:[infusion_rate], t:t}]);
 return G=model.simulate(infusion, initial);
}
var Solution = function(obj){
 for(key in obj){
  this[key] = obj[key];
}};

Solution.prototype.calc_at = function(t){
 if(this.isTCI){
  var TCI_sol = t<this.wait_t? this.TCI_solution_wait: this.TCI_solution;
  var sol = t<this.wait_t? this.solution_wait: this.solution;
  return {
   TCI_Ce:TCI_sol.Ce.calc_at(t),
   TCI_C1:TCI_sol.C1.calc_at(t),
   TCI_C2:TCI_sol.C2.calc_at(t),
   TCI_C3:TCI_sol.C3.calc_at(t),
   Ce:sol.Ce.calc_at(t),
   C1:sol.C1.calc_at(t),
   C2:sol.C2.calc_at(t),
   C3:sol.C3.calc_at(t),
   infusion:sol.infusion.calc_at(t),
   total:sol.total.calc_at(t)
  };
 }
 else{
  return {
   Ce:this.Ce.calc_at(t),
   C1:this.C1.calc_at(t),
   C2:this.C2.calc_at(t),
   C3:this.C3.calc_at(t),
   infusion:this.infusion.calc_at(t),
   total:this.total.calc_at(t)
  };
 }
};
var solution_zero = new Solution({
 Ce:new Linexp([]),
 C1:new Linexp([]),
 C2:new Linexp([]),
 C3:new Linexp([]),
 infusion:new Linexp([]),
 total:new Linexp([]),
 time:t_MIN
});

function give_solution_TCI(t, initial, target, TCI_model, model){
 var wait_dt = 0;
 var TCI_initial_afterequiv = {}, initial_afterequiv = {};
 var TCI_initial = {C1:initial.TCI_C1, C2:initial.TCI_C2, C3:initial.TCI_C3, Ce:initial.TCI_Ce, total: initial.total};
 var TCI_solution_wait = give_solution(t, TCI_initial, 0, TCI_model);
 var solution_wait = TCI_model==model? TCI_solution_wait: give_solution(t, initial, 0, model);
 var key,initial_C = {}
 if(TCI_initial.C1 > target){
  if( TCI_solution_wait.calc_at(Canvas_common.t2).C1 > target ){
   return new Solution( {isTCI:true, time:t, wait_t:t_MAX, TCI_solution_wait:TCI_solution_wait, solution_wait:solution_wait} );
  }
  var t_left = 0, t_right = Math.log(1/2)/model.eigen[2];
  while( TCI_solution_wait.calc_at( t + t_right ).C1 > target ){
   t_left = t_right; t_right+=Math.log(1/2)/model.eigen[2];
  }
  while(t_right-t_left > Accuracy){
   var wait_dt = (t_left + t_right)/2;
   if(TCI_solution_wait.calc_at( t + wait_dt ).C1 > target){ t_left = wait_dt; }
   else{ t_right = wait_dt; } 
  }
  TCI_initial = TCI_solution_wait.calc_at( t + wait_dt );;
  initial = solution_wait.calc_at( t + wait_dt );
 }
 else{
  for(key in TCI_initial) { TCI_initial_afterequiv = TCI_initial;}
  for(key in initial) { initial_afterequiv = initial;}
  if(TCI_initial.C1 < target){
   var bolus = TCI_model.V1 * (target-TCI_initial.C1);
   TCI_initial.total += bolus;
   initial.total += bolus;
   TCI_initial.C1 += bolus/TCI_model.V1;
   initial.C1 += bolus/model.V1;
  }
 }
 var TCI_equib_A1 = TCI_model.V1 * target; 
 var TCI_equib_A2 = TCI_equib_A1 * TCI_model.k12 / TCI_model.k21;
 var TCI_equib_A3 = TCI_equib_A1 * TCI_model.k13 / TCI_model.k31;
 var TCI_coeff_2 = TCI_initial.C2 * TCI_model.V2 - TCI_equib_A2;
 var TCI_coeff_3 = TCI_initial.C3 * TCI_model.V3 - TCI_equib_A3;
 var infusion = new Linexp([
  {k:0, c:[TCI_model.k10 * TCI_equib_A1], t:t+wait_dt},
  {k:-TCI_model.k21, c:[-TCI_model.k21 * TCI_coeff_2]},
  {k:-TCI_model.k31, c:[-TCI_model.k31 * TCI_coeff_3]}
 ])
 var TCI_solution = TCI_model.simulate(infusion, TCI_initial);
 var solution = TCI_model==model? TCI_solution: model.simulate(infusion, initial);
 return new Solution( {isTCI:true, time:t, wait_t: t+wait_dt, model:model,
  TCI_solution:TCI_solution, solution:solution,
  TCI_solution_wait:TCI_solution_wait, solution_wait:solution_wait} );
}

Row.prototype.calc_solutions_until = function(t2){
 var solution_arr = [solution_zero];
 var current_solution = solution_zero;
 var current_val = 0;
 var TCI_model = null;
 if(this.TCI_model_g) TCI_model = this.TCI_model_g(Current_patient);
 var is_infusion = UnitInfoList[this.unit].is_infusion;
 var mg_per_val = UnitInfoList[this.unit].calc_mg_per_val(Current_patient.weight, this.labelinfo.mgmL);
 var pointer, t_next;
 var current_model = this.labelinfo.preset_model_g(Current_patient);
 for(pointer = 0; (t_next = this.div_arr[pointer])!==undefined; pointer++){
  if( t_next >= t2 ){ break; }
  var C_next = !TCI_model? {Ce:0, C1:0, C2:0, C3:0, infusion:0, total:0}:
   {Ce:0, C1:0, C2:0, C3:0, infusion:0, total:0, TCI_Ce:0, TCI_C1:0, TCI_C2:0, TCI_C3:0}
  if(current_solution !== solution_zero){ 
   C_next = current_solution.calc_at(t_next);
  }
  var new_model = this.labelinfo.model_at[t_next];
  if( new_model ){ // simulate dilution
   if(current_model.V1 < new_model.V1){ C_next.C1 *= current_model.V1 / new_model.V1; }
   if(current_model.V2 < new_model.V2){ C_next.C2 *= current_model.V2 / new_model.V2; }
   if(current_model.V3 < new_model.V3){ C_next.C3 *= current_model.V3 / new_model.V3; }
   current_model = new_model;
  }
  if( this.entry_at[t_next] !== undefined ){
   current_val = this.entry_at[t_next] * mg_per_val;
   if(!is_infusion){ // bolus mode
    C_next.C1 += current_val/current_model.V1;
    C_next.total += current_val;
    current_val = 0;
   }
  }
  var solution_next = TCI_model?
   give_solution_TCI(t_next, C_next, current_val, TCI_model, current_model):
   give_solution(t_next, C_next, current_val, current_model);
  solution_arr.push(solution_next);
  current_solution = solution_next;
 }
 this.temp_solution_arr = solution_arr;
 return solution_arr;
}

Row.prototype.calc_solutions_until_rand = function(t2, model_rand){
 var solution_arr = [solution_zero];
 var current_solution = solution_zero;
 var current_val = 0;
 var TCI_model = null;
 if(this.TCI_model_g) TCI_model = this.TCI_model_g(Current_patient);
 var is_infusion = UnitInfoList[this.unit].is_infusion;
 var mg_per_val = UnitInfoList[this.unit].calc_mg_per_val(Current_patient.weight, this.labelinfo.mgmL);
 var pointer, t_next;
 var preset_model = this.labelinfo.preset_model_g(Current_patient);
 var current_model = model_rand;
 for(pointer = 0; (t_next = this.div_arr[pointer])!==undefined; pointer++){
  if( t_next >= t2 ){ break; }
  var C_next = !TCI_model? {Ce:0, C1:0, C2:0, C3:0, infusion:0, total:0}:
   {Ce:0, C1:0, C2:0, C3:0, infusion:0, total:0, TCI_Ce:0, TCI_C1:0, TCI_C2:0, TCI_C3:0}
  if(current_solution !== solution_zero){ 
   C_next = current_solution.calc_at(t_next);
  }
  var new_model_ref = this.labelinfo.model_at[t_next];
  if( new_model_ref ){ // simulate dilution
   var V1 = new_model_ref.V1==preset_model.V1 ? model_rand.V1 : new_model_ref.V1;
   var V2 = new_model_ref.V2==preset_model.V2 ? model_rand.V2 : new_model_ref.V2;
   var V3 = new_model_ref.V3==preset_model.V3 ? model_rand.V3 : new_model_ref.V3;
   var CL = new_model_ref.CL==preset_model.CL ? model_rand.CL : new_model_ref.CL;
   var Q2 = new_model_ref.Q2==preset_model.Q2 ? model_rand.Q2 : new_model_ref.Q2;
   var Q3 = new_model_ref.Q3==preset_model.Q3 ? model_rand.Q3 : new_model_ref.Q3;
   var ke = new_model_ref.ke==preset_model.ke ? model_rand.ke : new_model_ref.ke;
 //restore individual model if the parameter equals preset @ v1.6.2
   new_model = model_from_VQ(V1,V2,V3,CL,Q2,Q3,ke)
   if(current_model.V1 < new_model.V1){ C_next.C1 *= current_model.V1 / new_model.V1; }
   if(current_model.V2 < new_model.V2){ C_next.C2 *= current_model.V2 / new_model.V2; }
   if(current_model.V3 < new_model.V3){ C_next.C3 *= current_model.V3 / new_model.V3; }
   current_model = new_model;
  }
  if( this.entry_at[t_next] !== undefined ){
   current_val = this.entry_at[t_next] * mg_per_val;
   if(!is_infusion){ // bolus mode
    C_next.C1 += current_val/current_model.V1;
    C_next.total += current_val;
    current_val = 0;
   }
  }
  var solution_next = TCI_model?
   give_solution_TCI(t_next, C_next, current_val, TCI_model, current_model):
   give_solution(t_next, C_next, current_val, current_model);
  solution_arr.push(solution_next);
  current_solution = solution_next;
 }
 this.temp_solution_arr = solution_arr;
 return solution_arr;
}

LabelInfo.prototype.simulate_t_arr = function(t_arr){// assume t_arr increase monotonicly
 var xi, xN = t_arr.length;
 var ri, rN = this.row_arr.length;
 var Ce123it = {} 
 Ce123it["Ce_ng_mL"] = new Array(xN);
 Ce123it["C1_ng_mL"] = new Array(xN);
 Ce123it["C2_ng_mL"] = new Array(xN);
 Ce123it["C3_ng_mL"] = new Array(xN);
 Ce123it["infusion_mg_h"] = new Array(xN);
 Ce123it["total_mg"] = new Array(xN);
 for(xi=0;xi<xN;xi++){
  Ce123it["Ce_ng_mL"][xi] = 0;
  Ce123it["C1_ng_mL"][xi] = 0;
  Ce123it["C2_ng_mL"][xi] = 0;
  Ce123it["C3_ng_mL"][xi] = 0;
  Ce123it["infusion_mg_h"][xi] = 0;
  Ce123it["total_mg"][xi] = 0;
 }
 for(ri=0;ri<rN;ri++){
  if( this.row_arr[ri].labelarea_div.className == "labelarea_off" ) {continue;}
  var sol_arr = this.row_arr[ri].calc_solutions_until(t_arr[t_arr.length-1]);
  var si = sol_arr.length - 1;
  xi = xN-1;
  while( xi>=0 ){
   var sol = sol_arr[si];
   while( t_arr[xi] >= sol.time && xi >= 0){
    if(sol !== solution_zero){
     var model = sol.model; 
     var Ce123it_new = sol.calc_at( t_arr[xi] );
     Ce123it["Ce_ng_mL"][xi] += Ce123it_new.Ce * 1000; // mg/L to ng/mL
     Ce123it["C1_ng_mL"][xi] += Ce123it_new.C1 * 1000; // mg/L to ng/mL
     Ce123it["C2_ng_mL"][xi] += Ce123it_new.C2 * 1000; // mg/L to ng/mL
     Ce123it["C3_ng_mL"][xi] += Ce123it_new.C3 * 1000; // mg/L to ng/mL
     Ce123it["infusion_mg_h"][xi] += Ce123it_new.infusion * 60; // mg/min to mg/h
     Ce123it["total_mg"][xi] += Ce123it_new.total;
    }
    xi--;
   }
   si--;
  }
 }
 var key; for(key in Ce123it){
  for(xi=0;xi<xN;xi++){
   if(Ce123it[key][xi] != Ce123it[key][xi].toPrecision(4)){
    Ce123it[key][xi] = Ce123it[key][xi]>Accuracy? Ce123it[key][xi].toPrecision(4): "0";
   }
  }
  Ce123it[key] = Ce123it[key].join(",");
 }
 return Ce123it;
}

LabelInfo.prototype.simulate = function(showCompart){
 var xi, xN = Canvas_common.x_arr.length;
 var ri, rN = this.row_arr.length;
 var C1_arr = new Array(xN);
 var Ce_arr = new Array(xN);
 var t_model;
 if(showCompart){
  var t_model, t_next;
  var current_model = this.preset_model_g(Current_patient);
  xi = 0;
  for(pointer = 0; xi<Canvas_common.x_arr.length; pointer++){
   var t_next = this.model_arr[pointer] || t_MAX;
   var x_next = t_next > Canvas_common.t2? Canvas_common.x_arr.length: t2x(t_next);
   for(; xi < x_next; xi++){ Compart.model[xi] = current_model; }
   if(xi >= Canvas_common.x_arr.length)break;
   current_model = this.model_at[t_next];
 }}
 for(xi=0;xi<xN;xi++){
  C1_arr[xi] = 0;
  Ce_arr[xi] = 0;
  if( showCompart ){
   Compart.infusion_rate[xi] = 0;
   Compart.C1[xi] = 0;
   Compart.C2[xi] = 0;
   Compart.C3[xi] = 0;
   Compart.infusion_rate[xi] = 0;
   Compart.total[xi] = 0;
   Compart.C1expr[xi] = new Linexp([]);
   Compart.C2expr[xi] = new Linexp([]);
   Compart.C3expr[xi] = new Linexp([]);
   Compart.Ceexpr[xi] = new Linexp([]);
   Compart.Ciexpr[xi] = new Linexp([]);
 }}
 for(ri=0;ri<rN;ri++){
  if( this.row_arr[ri].labelarea_div.className == "labelarea_off" ) {continue;}
  var sol_arr = this.row_arr[ri].calc_solutions_until(Canvas_common.t2);
  var si = sol_arr.length - 1;
  xi = xN-1;
  while( xi>=0 ){
   var sol = sol_arr[si];
   while( x2t(xi) >= sol.time && xi >= 0){
    if(sol !== solution_zero){
     var model = sol.model; 
     var Ce123it = sol.calc_at(x2t(xi));
     Ce_arr[xi] += Ce123it.Ce;
     C1_arr[xi] += Ce123it.C1;
     if( showCompart ){
      Compart.C1[xi] += Ce123it.C1;
      Compart.C2[xi] += Ce123it.C2;
      Compart.C3[xi] += Ce123it.C3;
      Compart.infusion_rate[xi] += Ce123it.infusion;
      Compart.total[xi] += Ce123it.total;
      if(sol.isTCI){
       Compart.C1expr[xi].addlinexp( x2t(xi)<sol.wait_t? sol.solution_wait.C1: sol.solution.C1);
       Compart.C2expr[xi].addlinexp( x2t(xi)<sol.wait_t? sol.solution_wait.C2: sol.solution.C2);
       Compart.C3expr[xi].addlinexp( x2t(xi)<sol.wait_t? sol.solution_wait.C3: sol.solution.C3);
       Compart.Ciexpr[xi].addlinexp( x2t(xi)<sol.wait_t? sol.solution_wait.infusion: sol.solution.infusion);
       Compart.Ceexpr[xi].addlinexp( x2t(xi)<sol.wait_t? sol.solution_wait.Ce: sol.solution.Ce);
      } else {
       Compart.C1expr[xi].addlinexp(sol.C1);
       Compart.C2expr[xi].addlinexp(sol.C2);
       Compart.C3expr[xi].addlinexp(sol.C3);
       Compart.Ciexpr[xi].addlinexp(sol.infusion);
       Compart.Ceexpr[xi].addlinexp(sol.Ce);
      }
     }
    }
    xi--;
   }
   si--;
  }
 }
 return [C1_arr,Ce_arr];
}

LabelInfo.prototype.simulate_t_arr_rand = function(t_arr, model_rand){// assume t_arr increase monotonicly
 var xi, xN = t_arr.length;
 var ri, rN = this.row_arr.length;
 var Ce123it = {} 
 Ce123it["Ce_ng_mL"] = new Array(xN);
 Ce123it["C1_ng_mL"] = new Array(xN);
 Ce123it["C2_ng_mL"] = new Array(xN);
 Ce123it["C3_ng_mL"] = new Array(xN);
 Ce123it["infusion_mg_h"] = new Array(xN);
 Ce123it["total_mg"] = new Array(xN);
 for(xi=0;xi<xN;xi++){
  Ce123it["Ce_ng_mL"][xi] = 0;
  Ce123it["C1_ng_mL"][xi] = 0;
  Ce123it["C2_ng_mL"][xi] = 0;
  Ce123it["C3_ng_mL"][xi] = 0;
  Ce123it["infusion_mg_h"][xi] = 0;
  Ce123it["total_mg"][xi] = 0;
 }
 for(ri=0;ri<rN;ri++){
  if( this.row_arr[ri].labelarea_div.className == "labelarea_off" ) {continue;}
  var sol_arr = this.row_arr[ri].calc_solutions_until_rand(t_arr[t_arr.length-1], model_rand);
  var si = sol_arr.length - 1;
  xi = xN-1;
  while( xi>=0 ){
   var sol = sol_arr[si];
   while( t_arr[xi] >= sol.time && xi >= 0){
    if(sol !== solution_zero){
     var model = sol.model; 
     var Ce123it_new = sol.calc_at( t_arr[xi] );
     Ce123it["Ce_ng_mL"][xi] += Ce123it_new.Ce * 1000; // mg/L to ng/mL
     Ce123it["C1_ng_mL"][xi] += Ce123it_new.C1 * 1000; // mg/L to ng/mL
     Ce123it["C2_ng_mL"][xi] += Ce123it_new.C2 * 1000; // mg/L to ng/mL
     Ce123it["C3_ng_mL"][xi] += Ce123it_new.C3 * 1000; // mg/L to ng/mL
     Ce123it["infusion_mg_h"][xi] += Ce123it_new.infusion * 60; // mg/min to mg/h
     Ce123it["total_mg"][xi] += Ce123it_new.total;
    }
    xi--;
   }
   si--;
  }
 }
 var key; for(key in Ce123it){
  for(xi=0;xi<xN;xi++){
   if(Ce123it[key][xi] != Ce123it[key][xi].toPrecision(4)){
    Ce123it[key][xi] = Ce123it[key][xi]>Accuracy? Ce123it[key][xi].toPrecision(4): "0";
   }
  }
  Ce123it[key] = Ce123it[key].join(",");
 }
 return Ce123it;
}
//////
LabelInfo.prototype.simulate_rand = function(model_rand){
 var xi, xN = Canvas_common.x_arr.length;
 var ri, rN = this.row_arr.length;
 var C1_arr = new Array(xN);
 var Ce_arr = new Array(xN);
 var t_model;
 for(xi=0;xi<xN;xi++){
  C1_arr[xi] = 0;
  Ce_arr[xi] = 0;
 }
 for(ri=0;ri<rN;ri++){
  if( this.row_arr[ri].labelarea_div.className == "labelarea_off" ) {continue;}
  var sol_arr = this.row_arr[ri].calc_solutions_until_rand(Canvas_common.t2, model_rand);
  var si = sol_arr.length - 1;
  xi = xN-1;
  while( xi>=0 ){
   var sol = sol_arr[si];
   while( x2t(xi) >= sol.time && xi >= 0){
    if(sol !== solution_zero){
     var model = sol.model; 
     var Ce123it = sol.calc_at(x2t(xi));
     Ce_arr[xi] += Ce123it.Ce;
     C1_arr[xi] += Ce123it.C1;
    }
    xi--;
   }
   si--;
  }
 }
 return [C1_arr,Ce_arr];
}


/* canvas */

var canvas_1, ctx_1; // main
var canvas_1_cursor, ctx_1_cursor;
var canvas_2, ctx_2; // compartment
var canvas_2_cursor, ctx_2_cursor;
var canvas_3, ctx_3; // propofol+opioid effect
var canvas_3_cursor, ctx_3_cursor;
var canvas_4, ctx_4; // individual variance
var canvas_4_cursor, ctx_4_cursor;

function x2t(x){ return Canvas_common.t1 + (x-O_x)*Canvas_common.t_scale; }
function t2x(t){
 var x = Math.floor(O_x + (t-Canvas_common.t1)/Canvas_common.t_scale);
 return 0<=x&&x<=W ? x : -999;
}

function canvas_resize(){
 canvas_1.width = W;
 canvas_1.height = H;
 canvas_1_cursor.width = W;
 canvas_1_cursor.height = H;
 canvas_2.width = W;
 canvas_2.height = H;
 canvas_2_cursor.width = W;
 canvas_2_cursor.height = H;
 canvas_3.width = W;
 canvas_3.height = H;
 canvas_3_cursor.width = W;
 canvas_3_cursor.height = H;
 canvas_4.width = W;
 canvas_4.height = H;
 canvas_4_cursor.width = W;
 canvas_4_cursor.height = H;
 document.getElementById("row_container").style.top = H + "px";
 document.getElementById("x_scale_setting_1").style.left = W - 100 + "px";
 document.getElementById("x_scale_setting_2").style.left = W - 100 + "px";
 document.getElementById("x_scale_setting_3").style.left = W - 100 + "px";
 document.getElementById("x_scale_setting_4").style.left = W - 100 + "px";
 var n; for(n=0;n<Row_arr.length;n++){
  Row_arr[n].dosearea_div.style.minWidth = W + "px";
 }
 document.getElementById("output_data_area").style.width = W + "px";
 document.getElementById("output_conc_area").style.width = W + "px";
 document.getElementById("area4_output_conc_area").style.width = W + "px";
 Canvas_common.ready();
 update_x_axis(Canvas_common.t1, Canvas_common.t_scale_150);
}
function canvas_ready(){
 canvas_1 = document.getElementById('canvas_1'); // graph
 if ( ! canvas_1 || ! canvas_1.getContext ) { return false; }
 canvas_1_cursor = document.getElementById('canvas_1_cursor'); // mouse_event, dynamic layer
 canvas_2 = document.getElementById('canvas_2'); // compartment
 canvas_2_cursor = document.getElementById('canvas_2_cursor');
 canvas_3 = document.getElementById('canvas_3'); // effect
 canvas_3_cursor = document.getElementById('canvas_3_cursor');
 canvas_4 = document.getElementById('canvas_4'); // individual
 canvas_4_cursor = document.getElementById('canvas_4_cursor');

 canvas_1_cursor.ondblclick = function(e){ scale_now(); };
 canvas_1_cursor.ondragstart = function(){ return false; };
 canvas_1_cursor.onmousedown = function(e) {
  clearTimeout(canvas1_timer);
  canvas1_timer = setTimeout("Canvas_common.is_moving = true", 300);
  Canvas_common.moving_from = e.pageX;
 };
 canvas_1_cursor.onmousemove = function(e) {
  if(Canvas_common.is_moving){
   var dx = Math.round ( (e.pageX - Canvas_common.moving_from)/75 ) * 75;
   draw_moving_x_axis(ctx_1_cursor, dx);
  } else {
   var MouseRect = e.target.getBoundingClientRect();
   var x = e.clientX - MouseRect.left;
   var y = e.clientY - MouseRect.top;
   canvas1_cross( x,y, false );
 }};
 canvas_2_cursor.onmousemove = function(e) {
  var MouseRect = e.target.getBoundingClientRect();
  var x = e.clientX - MouseRect.left;
  var y = e.clientY - MouseRect.top;
  canvas2_cross( x,y, false );
 };
 canvas_3_cursor.onmousemove = function(e) {
  var MouseRect = e.target.getBoundingClientRect();
  var x = e.clientX - MouseRect.left;
  var y = e.clientY - MouseRect.top;
  canvas3_cross( x,y, false );
 };
//////
 canvas_1_cursor.onmouseup = function(e) {
  clearTimeout(canvas1_timer);
  if(Canvas_common.is_moving){
   ctx_1_cursor.clearRect(0, 0, W, H);
   var dx = Math.round ( (e.pageX - Canvas_common.moving_from)/75 ) * 75;
   update_x_axis(Canvas_common.t1 - dx * Canvas_common.t_scale, Canvas_common.t_scale_150);
   Canvas_common.is_moving = false;
   delete(Canvas_common.moving_from);
 }};
 canvas_1_cursor.onmouseout = function() {
  clearTimeout(canvas1_timer);
  if(Canvas_common.is_moving){
   Canvas_common.is_moving = false;
   delete(Canvas_common.moving_from);
  } else {
   ctx_1_cursor.clearRect(0, 0, W, H);
   Canvas1CrossFix = false;
 }};
 setEvent(canvas_1_cursor, 'touchstart', canvas_1_touchstart);
 setEvent(canvas_1_cursor, 'touchmove', canvas_1_touchmove);
 setEvent(canvas_1_cursor, 'touchend', canvas_1_touchend);
 setEvent(canvas_2_cursor, 'touchmove', canvas_2_touchmove);
 setEvent(canvas_3_cursor, 'touchmove', canvas_3_touchmove);
// setEvent(canvas_4_cursor, 'touchmove', canvas_4_touchmove);//////
 ctx_1 = canvas_1.getContext('2d');
 ctx_1_cursor = canvas_1_cursor.getContext('2d');
 ctx_2 = canvas_2.getContext('2d');
 ctx_2_cursor = canvas_2_cursor.getContext('2d');
 ctx_3 = canvas_3.getContext('2d');
 ctx_3_cursor = canvas_3_cursor.getContext('2d');
 ctx_4 = canvas_4.getContext('2d');
 ctx_4_cursor = canvas_4_cursor.getContext('2d');
 canvas_resize();
// delete childnodes in case user has downloaded loaded HTML 
 var div = document.getElementById("row_container");
 while (div.firstChild) { div.removeChild(div.lastChild); }
 create_new_row();
}
function draw_moving_x_axis(ctx, dx){
 ctx.clearRect(0, 0, W, H);
 ctx.fillStyle = cCu;
 ctx.strokeStyle = cCu;
 for(t=Canvas_common.t1; t<Canvas_common.t2; t+=Canvas_common.t_scale_150){ //draw v-line
  ctx.beginPath();
  ctx.moveTo( t2x(t)+dx , 0);
  ctx.lineTo( t2x(t)+dx , H-O_y);
  ctx.stroke();
  ctx.fillText( min2hm(t), t2x(t)+dx, H-O_y/2-15);
 }
 var xi, xN = Canvas_common.x_arr.length;
 var x_arr = new Array(xN);
 var y_arr = new Array(xN);
 if(Compart.div){
  for(xi=0;xi<xN;xi++){
   x_arr[xi] = Canvas_common.x_arr[xi] + dx;
   y_arr[xi] = Math.floor(H-O_y-Compart.C1[xi]*1000*50/LabelInfoList[Compart.div.innerHTML].y_scale_50/Math.pow(2,Canvas_common.y_scale));
 }}
 ctx.strokeStyle = "#636363";
 plot_graph(ctx, x_arr, y_arr);
}
function update_x_axis(t1, t_scale_150){
 Canvas_common.update(t1, t_scale_150);
 update_entry_div();
 update_graph();
 document.getElementById("output_t1").value = min2hm(Canvas_common.t1);
 document.getElementById("output_t2").value = min2hm(Canvas_common.t2);
 document.getElementById("area4_output_t1").value = min2hm(Canvas_common.t1);
 document.getElementById("area4_output_t2").value = min2hm(Canvas_common.t2);
}
function update_entry_div(){
 var ri, rN = Row_arr.length;
 for(ri=0; ri<rN; ri++){
  for(time in Row_arr[ri].div_at){
   var div = Row_arr[ri].div_at[time];
   div.style.left = t2x(time) + "px";
}}}

var area4_M = 10, area4_alpha = 1, area4_option = 1 ; // 0:C1 or 1:Ce

function set_area4_option(x){
 area4_option = x;
 setClass(document.getElementById("area4_option_container").children[x], "button_wide_selected");
 setClass(document.getElementById("area4_option_container").children[1-x], "button_wide");
 update_graph();
}

function update_area4_num(){
 area4_M=parseInt( document.getElementById("area4_num").value );
 if(area4_M>10000)area4_M = 10000;
 if(!area4_M || area4_M<0)area4_M = 0;
 document.getElementById("area4_num_new").innerHTML = area4_M;
 update_graph();
}
function update_area4_alpha(){
 area4_alpha=parseFloat( document.getElementById("area4_a").value );
 if(!area4_M || area4_alpha>1)area4_alpha = 1;
 if(area4_M<0)area4_M = 0;
 document.getElementById("area4_a_new").innerHTML = area4_alpha;
 update_graph();
}
function area4_ref(){
 Fentanyl_rands_list = [];
 var k;for(k=0;k<area4_M;k++) Fentanyl_rands_list[k] = make_rands(6);
 update_graph();
}

function update_graph(){
 Canvas1CrossFix = false;
 ctx_1.clearRect(0, 0, W, H);
 ctx_2.clearRect(0, 0, W, H);
 ctx_3.clearRect(0, 0, W, H);
 ctx_4.clearRect(0, 0, W, H);
 ctx_1.fillStyle = cBG;
 ctx_1.fillRect(0, 0, W, H);
 ctx_2.fillStyle = cBG;
 ctx_2.fillRect(0, 0, W, H);
 ctx_3.fillStyle = cBG;
 ctx_3.fillRect(0, 0, W, H);
 ctx_4.fillStyle = cBG;
 ctx_4.fillRect(0, 0, W, H);
 draw_axis(ctx_1,Math.pow(2,Canvas_common.y_scale),"ng/mL");
 draw_axis(ctx_2,Math.pow(2,Canvas_common.y_scale),"ng/mL");
 draw_axis(ctx_3,20,"%");
 draw_axis(ctx_4,Math.pow(2,Canvas_common.y_scale),"ng/mL");
 var count = -1;
 var E_p = [], E_o = [];
 var xi,xN = Canvas_common.x_arr.length;
 for(xi=0;xi<xN;xi++){ E_p.push(0);E_o.push(0); }
 var k;for(k=Fentanyl_rands_list.length;k<area4_M;k++) Fentanyl_rands_list[k] = make_rands(6);
 for(label in LabelInfoList){
  count++;
  var labelinfo = LabelInfoList[ label ];
  var showCompart = labelinfo.compart_label_div.className=="button_wide_selected";
  var C1e_arr = labelinfo.simulate(showCompart);
  var y1e_arr = [[],[]];
  for(xi=0;xi<xN;xi++){
   y1e_arr[0].push( Math.floor(H-O_y-C1e_arr[0][xi]*1000*50/labelinfo.y_scale_50/Math.pow(2,Canvas_common.y_scale)) );
   y1e_arr[1].push( Math.floor(H-O_y-C1e_arr[1][xi]*1000*50/labelinfo.y_scale_50/Math.pow(2,Canvas_common.y_scale)) );
  }
  ctx_1.strokeStyle = labelinfo.color;
  ctx_1.fillStyle = labelinfo.color;
  plot_graph(ctx_1, Canvas_common.x_arr, y1e_arr[0]);
  fill_graph(ctx_1, Canvas_common.x_arr, y1e_arr[1]);
  var y_label =  label + ": x" + labelinfo.y_scale_50;
  ctx_1.fillText(y_label, 0, H - O_y - 2 - (count)*18);
  if( showCompart ){
   var y2_arr = [], y3_arr = [];
   for(xi=0;xi<xN;xi++){
    y2_arr.push( Math.floor(H-O_y-Compart.C2[xi]*1000*50/labelinfo.y_scale_50/Math.pow(2,Canvas_common.y_scale)) );
    y3_arr.push( Math.floor(H-O_y-Compart.C3[xi]*1000*50/labelinfo.y_scale_50/Math.pow(2,Canvas_common.y_scale)) );
   }
   ctx_2.strokeStyle = Compart_color_arr[0];
   plot_graph(ctx_2, Canvas_common.x_arr, y1e_arr[0]);
   ctx_2.strokeStyle = Compart_color_arr[1];
   plot_graph(ctx_2, Canvas_common.x_arr, y2_arr);
   ctx_2.strokeStyle = Compart_color_arr[2];
   plot_graph(ctx_2, Canvas_common.x_arr, y3_arr);
  }
  if( labelinfo.agent == "Propofol" ){
   for(xi=0;xi<xN;xi++){ E_p[xi] += C1e_arr[1][xi]; }
  }
  if( labelinfo.agent == "Remifentanil" || labelinfo.agent == "Fentanyl" ){
   for(xi=0;xi<xN;xi++){ E_o[xi] += C1e_arr[1][xi]; }
  }
  if( labelinfo.agent == "Fentanyl"){
   var indi; // index for individual variance
   for(indi=0;indi<area4_M;indi++){
    var model_rand = model_F_B2020_rand(Current_patient, Fentanyl_rands_list[indi]);
    var C1e_arr = labelinfo.simulate_rand(model_rand);
    var y_arr = [];
    for(xi=0;xi<xN;xi++){
     y_arr.push( Math.floor(H-O_y-C1e_arr[area4_option][xi]*1000*50/labelinfo.y_scale_50/Math.pow(2,Canvas_common.y_scale)) );
    }
    ctx_4.strokeStyle = labelinfo.color;
    ctx_4.globalAlpha = area4_alpha;
    plot_graph(ctx_4, Canvas_common.x_arr, y_arr);
    var y_label =  label + ": x" + labelinfo.y_scale_50;
    ctx_4.fillText(y_label, 0, H - O_y - 2 - (count)*18);
  }}
 }
    ctx_4.globalAlpha=1;
 var ei;for(ei=0;ei<EffectList.length;ei++){
  var effect = EffectList[ei];
  var y_ratio = [];
  for(xi=0;xi<xN;xi++){
   var numer = Math.pow(E_o[xi]*1000/effect.C50r + E_p[xi]/effect.C50p + effect.alpha * E_o[xi]*1000/effect.C50r * E_p[xi]/effect.C50p, effect.n);
   var denom = numer + 1;
   y_ratio[xi] = H-O_y - numer/denom*100 * 50/20 ; // 20% per 50px
  }
  ctx_3.strokeStyle = effect.color;
  plot_graph(ctx_3, Canvas_common.x_arr, y_ratio);
 }
}
var Fentanyl_rands_list = []

var EffectList=[
 {label_ja:"圧痛計への反応消失", label_en:"Loss of response to pressure algometry", C50p:4.2, C50r:8.8, n:8.3, alpha:8.2, color:"red"},
 {label_ja:"テタニー刺激への反応消失", label_en:"Loss of response to electrical tetany", C50p:4.6, C50r:23.1, n:6.0, alpha:14.7, color:"blue"},
 {label_ja:"喉頭鏡への反応消失", label_en:"Loss of response to laryngoscopy", C50p:5.6, C50r:48.9, n:2.2, alpha:33.2, color:"green"},
 {label_ja:"応答消失", label_en:"Loss of responsiveness", C50p:2.2, C50r:33.1, n:50, alpha:3.6, color:"purple"}
];

function draw_axis(ctx,dy,y_unit){
 ctx.font = ctx_font;
 ctx.beginPath(); ctx.moveTo(0, H-O_y); ctx.lineTo(W, H-O_y); ctx.strokeStyle = cAX1; ctx.stroke();
 ctx.beginPath(); ctx.moveTo(O_x, 0); ctx.lineTo(O_x, H-O_y); ctx.strokeStyle = cAX1; ctx.stroke();
 ctx.fillStyle = cCH;
 ctx.textAlign = "right";
 ctx.fillText( y_unit, O_x, 15);
 ctx.textAlign = "left";
 ctx.strokeStyle = cAX2;
 var x;
 for(x=O_x; x<W; x+=150){ //draw v-line
  ctx.beginPath();
  ctx.moveTo( x, 0);
  ctx.lineTo( x, H-O_y);
  ctx.stroke();
  ctx.fillText( min2hm(x2t(x)), x, H-O_y/2);
 }
 ctx.textAlign = "right";
 var y;
 for(y=0; y<H-O_y; y+=50){ //draw h-line
  ctx.beginPath();
  ctx.moveTo( O_x, H - O_y - y );
  ctx.lineTo( W, H - O_y - y );
  ctx.stroke();
  ctx.fillText( (y/50) * dy, O_x, H - O_y - y);
 }
 ctx.textAlign = "left";
}
function plot_graph(ctx, x_arr, y_arr){ // set ctx_1.strokeStyle before this
 ctx.beginPath();
 ctx.moveTo(x_arr[0], y_arr[0]);
 var i;
 for(i=1; i<x_arr.length; i++){
  ctx.lineTo(x_arr[i], y_arr[i]);
 }
 ctx.stroke();
}
function fill_graph(ctx, x_arr, y_arr){ // set ctx_1.fillStyle before this
 ctx.globalAlpha = 0.2;
 ctx.beginPath();
 ctx.moveTo(x_arr[0], H-O_y);
 var i;
 for(i=0; i<x_arr.length; i++){
  ctx.lineTo(x_arr[i], y_arr[i]);
  if(isNaN(y_arr[i]))break; // v1.6.2
 }
 // ctx.lineTo(x_arr[x_arr.length-1], H-O_y);
 ctx.lineTo(x_arr[i-1], H-O_y); //v1.6.2
 ctx.closePath();
 ctx.fill();
 ctx.globalAlpha = 1;
}
function scale_now(){
 var t1 = (new Date()).getHours()*60 + (new Date()).getMinutes();
 t1 = Math.floor(t1/Canvas_common.t_scale_150)*Canvas_common.t_scale_150;
 update_x_axis(t1, Canvas_common.t_scale_150);
}
// 1m <- 2m <- 5m <- 15m <- 30m <- 1h <- 3h <- 6h <- 12h <- 24h <- 2d <- 4d <- 7d

function scale_short(){
 var t_scale_150 =  Canvas_common.t_scale_150;
 if(t_scale_150 <=1){ t_scale_150 = 1;}
 else if(t_scale_150==5){ t_scale_150 = 2; }
 else if(t_scale_150==15){ t_scale_150 = 5; }
 else if(t_scale_150==3*60){ t_scale_150 = 60; }
 else if(t_scale_150==7*24*60){ t_scale_150 = 4*24*60; }
 else{ t_scale_150 /= 2;}
 t1 = Math.floor(Canvas_common.t1/t_scale_150)*t_scale_150;
 update_x_axis(t1, t_scale_150);
 document.getElementById("x_scale_setting_1").children[1].innerHTML = "-";
 document.getElementById("x_scale_setting_2").children[1].innerHTML = "-";
 document.getElementById("x_scale_setting_3").children[1].innerHTML = "-";
 document.getElementById("x_scale_setting_4").children[1].innerHTML = "-";
 if(t_scale_150==1){
  document.getElementById("x_scale_setting_1").children[0].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_2").children[0].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_3").children[0].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_4").children[0].innerHTML = "&nbsp;";
}}
// 1m -> 2m -> 5m-> 10m -> 30m -> 1h -> 2h -> 4h -> 8h -> 24h -> 2d -> 4d -> 7d
function scale_long(){
 var t_scale_150 =  Canvas_common.t_scale_150;
 if(t_scale_150 == 7*24*60){ return;}
 else if(t_scale_150==2){ t_scale_150 = 5; }
 else if(t_scale_150==10){ t_scale_150 = 30; }
 else if(t_scale_150==8*60){ t_scale_150 = 24*60; }
 else if(t_scale_150==4*24*60){ t_scale_150 = 7*24*60; }
 else{ t_scale_150 *= 2;}
 t1 = Math.floor(Canvas_common.t1/t_scale_150)*t_scale_150;
 update_x_axis(t1, t_scale_150);
 document.getElementById("x_scale_setting_1").children[0].innerHTML = "+";
 document.getElementById("x_scale_setting_2").children[0].innerHTML = "+";
 document.getElementById("x_scale_setting_3").children[0].innerHTML = "+";
 document.getElementById("x_scale_setting_4").children[0].innerHTML = "+";
 if(t_scale_150 == 7*24*60){
  document.getElementById("x_scale_setting_1").children[1].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_2").children[1].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_3").children[1].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_4").children[1].innerHTML = "&nbsp;";
}}
function scale_prev(){
 if(Canvas_common.t1 < t_MIN/10){
  document.getElementById("x_scale_setting_1").children[3].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_2").children[3].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_3").children[3].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_4").children[3].innerHTML = "&nbsp;";
  return;
 }
 update_x_axis(Canvas_common.t1 - Canvas_common.t_scale_150, Canvas_common.t_scale_150);
 document.getElementById("x_scale_setting_1").children[4].innerHTML = "&gt;";
 document.getElementById("x_scale_setting_2").children[4].innerHTML = "&gt;";
 document.getElementById("x_scale_setting_3").children[4].innerHTML = "&gt;";
 document.getElementById("x_scale_setting_4").children[4].innerHTML = "&gt;";
}
function scale_next(){
 if(Canvas_common.t1 > t_MAX/10){
  document.getElementById("x_scale_setting_1").children[4].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_2").children[4].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_3").children[4].innerHTML = "&nbsp;";
  document.getElementById("x_scale_setting_4").children[4].innerHTML = "&nbsp;";
  return;
 }
 update_x_axis(Canvas_common.t1 + Canvas_common.t_scale_150, Canvas_common.t_scale_150);
 document.getElementById("x_scale_setting_1").children[3].innerHTML = "&lt;";
 document.getElementById("x_scale_setting_2").children[3].innerHTML = "&lt;";
 document.getElementById("x_scale_setting_3").children[3].innerHTML = "&lt;";
 document.getElementById("x_scale_setting_4").children[3].innerHTML = "&lt;";
}

function yscale_short(){
 Canvas_common.y_scale--;
 update_graph();
}
function yscale_long(){
 Canvas_common.y_scale++;
 update_graph();
}

/* touchevent */

var canvas1_timer;

function canvas_1_touchstart(e){
  clearTimeout(canvas1_timer);
 canvas1_timer = setTimeout( "Canvas_common.is_moving = true", 300);
 Canvas_common.moving_from = e.changedTouches[0].pageX;
}
function canvas_1_touchmove(e){
 if(e.changedTouches.length==1){
  if(Canvas_common.is_moving){
   var dx = Math.round( (e.changedTouches[0].pageX - Canvas_common.moving_from)/75 ) * 75;
   draw_moving_x_axis(ctx_1_cursor, dx);
  } else {
   var MouseRect = e.target.getBoundingClientRect();
   var x = e.clientX - MouseRect.left;
   var y = e.clientY - MouseRect.top;
   canvas1_cross( x,y );
 }}
 else if(Canvas_common.is_moving){
  Canvas_common.is_moving = false;
  ctx_1_cursor.clearRect(0, 0, W, H);
  delete(Canvas_common.moving_from);
 }
};
function canvas_2_touchmove(e){
 if(e.changedTouches.length==1){
  var MouseRect = e.target.getBoundingClientRect();
  var x = e.clientX - MouseRect.left;
  var y = e.clientY - MouseRect.top;
  canvas2_cross( x,y );
}};
function canvas_3_touchmove(e){
 if(e.changedTouches.length==1){
  var MouseRect = e.target.getBoundingClientRect();
  var x = e.clientX - MouseRect.left;
  var y = e.clientY - MouseRect.top;
  canvas3_cross( x,y );
}};
////
function canvas_1_touchend(e){
 if(Canvas_common.is_moving){
  ctx_1_cursor.clearRect(0, 0, W, H);
  var dx = Math.round ( (e.changedTouches[0].pageX - Canvas_common.moving_from)/75 ) * 75;
  update_x_axis(Canvas_common.t1 - dx * Canvas_common.t_scale, Canvas_common.t_scale_150);
  Canvas_common.is_moving = false;
  delete(Canvas_common.moving_from);
 } else {
  clearTimeout(canvas1_timer);
  var MouseRect = e.target.getBoundingClientRect();
  var x = e.changedTouches[0].pageX - MouseRect.left;
  var y = e.changedTouches[0].pageY - MouseRect.top;
  canvas1_cross( x,y );
}};

function delete_cursor(){
 ctx_1_cursor.clearRect(0, 0, W, H);
 ctx_2_cursor.clearRect(0, 0, W, H);
 ctx_3_cursor.clearRect(0, 0, W, H);
 ctx_4_cursor.clearRect(0, 0, W, H);
 Canvas1CrossFix = false;
}
function canvas_vline(x){
 ctx_1_cursor.lineWidth = 1;
 ctx_1_cursor.strokeStyle = cCu;
 ctx_2_cursor.lineWidth = 1;
 ctx_2_cursor.strokeStyle = cCu;
 ctx_3_cursor.lineWidth = 1;
 ctx_3_cursor.strokeStyle = cCu;
 ctx_4_cursor.lineWidth = 1;
 ctx_4_cursor.strokeStyle = cCu;
 ctx_1_cursor.clearRect(0, 0, W, H);
 ctx_1_cursor.beginPath(); ctx_1_cursor.moveTo(x, 0); ctx_1_cursor.lineTo(x, H); ctx_1_cursor.stroke();
 ctx_2_cursor.clearRect(0, 0, W, H);
 ctx_2_cursor.beginPath(); ctx_2_cursor.moveTo(x, 0); ctx_2_cursor.lineTo(x, H); ctx_2_cursor.stroke();
 ctx_3_cursor.clearRect(0, 0, W, H);
 ctx_3_cursor.beginPath(); ctx_3_cursor.moveTo(x, 0); ctx_3_cursor.lineTo(x, H); ctx_3_cursor.stroke();
 ctx_4_cursor.clearRect(0, 0, W, H);
 ctx_4_cursor.beginPath(); ctx_4_cursor.moveTo(x, 0); ctx_4_cursor.lineTo(x, H); ctx_4_cursor.stroke();
}

function canvas1_cross( x,y ){
 if (x<0 || x>W || y<0 || y>H){ delete_cursor(); return;}
 canvas_vline(x);
 ctx_1_cursor.fillStyle = cCu;
 ctx_1_cursor.font = ctx_font;
 ctx_1_cursor.beginPath(); ctx_1_cursor.moveTo(0, y); ctx_1_cursor.lineTo(canvas_1_cursor.width, y); ctx_1_cursor.stroke();
 ctx_1_cursor.fillText( min2hm(x2t(x)), x, H);
 ctx_1_cursor.fillText( myPrecision((H-O_y-y)/50*Math.pow(2,Canvas_common.y_scale)), O_x, y);
 disp_compart_info(x);
 var t = x2t(x), count = 0, countN = 0;
 for(label in LabelInfoList){ countN++; }
 for(label in LabelInfoList){
  var labelinfo = LabelInfoList[label];
  var C = labelinfo.simulate_t_arr([t]);
  var unit = labelinfo.y_scale_50>10?1000:1;
  ctx_1_cursor.fillStyle = labelinfo.color;
  var txt = label + ":Cp=" + myPrecision(C.C1_ng_mL/unit);
  if(C.Ce_ng_mL!=0){ txt += ",Ce=" + myPrecision(C.Ce_ng_mL/unit); }
  txt += unit==1000?"[μg/mL]":"[ng/mL]";
  ctx_1_cursor.textAlign = x>W/2? "right": "left";
  ctx_1_cursor.textBaseline = y>18*countN? "alphabetic": "top";
  ctx_1_cursor.fillText(txt , x, y-2 + ((y>18*countN?0:countN-1)-count)*18);
  ctx_1_cursor.textAlign = "left";
  ctx_1_cursor.textBaseline = "alphabetic";
  count++;
 }
}

function canvas2_cross( x,y ){
 if (x<0 || x>W || y<0 || y>H){ delete_cursor(); return;}
 canvas_vline(x);
 ctx_2_cursor.fillStyle = cCu;
 ctx_2_cursor.font = ctx_font;
 ctx_2_cursor.beginPath(); ctx_2_cursor.moveTo(0, y); ctx_2_cursor.lineTo(canvas_2_cursor.width, y); ctx_2_cursor.stroke();
 ctx_2_cursor.fillText( min2hm(x2t(x)), x, H);
 ctx_2_cursor.fillText( myPrecision((H-O_y-y)/50*Math.pow(2,Canvas_common.y_scale)), O_x, y);
 disp_compart_info(x);
 if(Compart.div){
  var labelinfo = LabelInfoList[Compart.div.innerHTML];
  var t = x2t(x), count = 0;
  var C = labelinfo.simulate_t_arr([t]);
  var unit = labelinfo.y_scale_50>10?1000:1;
  var i;for(i=0;i<3;i++){
   ctx_2_cursor.fillStyle = Compart_color_arr[i];
   var txt = "C"+(1+i)+"=" + myPrecision(C["C"+(1+i)+"_ng_mL"]/unit);
   txt += unit==1000?"μg/mL":"[ng/mL]";
   ctx_2_cursor.textAlign = x>W/2? "right": "left";
   ctx_2_cursor.textBaseline = y>60? "alphabetic": "top";
   ctx_2_cursor.fillText(txt , x, y-2 + ((y>60?-2:0)+i)*18);
   ctx_2_cursor.textAlign = "left";
   ctx_2_cursor.textBaseline = "alphabetic";
  }
  count++;
 }
}

function canvas3_cross( x,y ){
 if (x<0 || x>W || y<0 || y>H){ delete_cursor(); return;}
 canvas_vline(x);
 ctx_3_cursor.fillStyle = cCu;
 ctx_3_cursor.font = ctx_font;
 ctx_3_cursor.beginPath(); ctx_3_cursor.moveTo(0, y); ctx_3_cursor.lineTo(canvas_3_cursor.width, y); ctx_3_cursor.stroke();
 ctx_3_cursor.fillText( min2hm(x2t(x)), x, H);
 ctx_3_cursor.fillText( myPrecision((H-O_y-y)/50*20), O_x, y);
 disp_compart_info(x);
 var E_p=0, E_o=0;
 var t = x2t(x);
 for(label in LabelInfoList){
  var labelinfo = LabelInfoList[label];
  if (labelinfo.agent == "Propofol"){
   var C = labelinfo.simulate_t_arr([t]);
   E_p += parseFloat(C.Ce_ng_mL);
  }
  if (labelinfo.agent == "Remifentanil" || labelinfo.agent == "Fentanyl"){
   var C = labelinfo.simulate_t_arr([t]);
   E_o += parseFloat(C.Ce_ng_mL);
  }
 }
 var ei;for(ei=0;ei<EffectList.length;ei++){
  var effect = EffectList[ei];
  var numer = Math.pow(E_o/effect.C50r + E_p/1000/effect.C50p + effect.alpha * E_o/effect.C50r * E_p/1000/effect.C50p, effect.n);
  var denom = numer + 1;
  ratio = 100*numer/denom;
  ctx_3_cursor.fillStyle = effect.color;
  var txt = effect["label_"+Lang] + ":" + myPrecision(ratio) + "%";
  ctx_3_cursor.textAlign = x>W/2? "right": "left";
  ctx_3_cursor.textBaseline = y>80? "alphabetic":"top";
  ctx_3_cursor.fillText(txt , x, y-2 + ((y>80?0:3)-ei)*18);
  ctx_3_cursor.textAlign = "left";
  ctx_3_cursor.textBaseline = "alphabetic";
 }
}
////

var Touching_n = -1;

function dosearea_touchstart(e){
 e.preventDefault();
 Touching_n = parseInt(e.target.getAttribute("n"));
 if(Row_arr[Touching_n]){ setClass(Row_arr[Touching_n].dosearea_div, "dosearea_hover"); }
 else{ Touching_n = -1; }
}

function dosearea_touchmove(e){
 e.preventDefault();
 var containerRect = document.getElementById("row_container").getBoundingClientRect();
 var x = e.changedTouches[0].pageX - containerRect.left;
 var y = e.changedTouches[0].pageY - containerRect.top;
 var new_n = Math.floor(y/row_H);
 if( new_n != Touching_n ){
  if(Touching_n != -1){ setClass(Row_arr[Touching_n].dosearea_div, "dosearea"); }
  if(Row_arr[new_n]){
   Touching_n = new_n;
   setClass(Row_arr[Touching_n].dosearea_div, "dosearea_hover");
  }
  else{ Touching_n = -1; }
 }
 cursor_to( e.changedTouches[0].pageX - containerRect.left );
}
function dosearea_touchend(e){
 e.preventDefault();
 var n = Touching_n;
 if(Row_arr[Touching_n]){
  setClass(Row_arr[Touching_n].dosearea_div, "dosearea");
  var containerRect = document.getElementById("row_container").getBoundingClientRect();
  var x = e.changedTouches[0].pageX - containerRect.left;
  var time =  x2t(x);
  add_drug(Touching_n,time);
  Touching_n = -1;
 }
}

/* mouseevent */

function dosearea_click(e){
 var containerRect = document.getElementById("row_container").getBoundingClientRect();
 var x = e.clientX - containerRect.left;
 var n = parseInt(e.target.getAttribute("n"));
 var time =  x2t(x);
 add_drug(n,time);
}
function dosearea_mousemove(e){
 if(e.target.hasAttribute("time")){
  cursor_to( t2x( parseInt(e.target.getAttribute("time") )) ) ;
 }
 else{
  var containerRect = document.getElementById("row_container").getBoundingClientRect();
  cursor_to( e.clientX - containerRect.left );
}}

function entry_click(e){ edit_drug(e.target); }
function entry_mousemove(e){
 cursor_to( t2x( parseInt(e.target.getAttribute("time") )) ) ;
}
function cursor_to(x){
 Canvas1CrossFix = false;
 canvas_vline(x);
 ctx_1_cursor.fillStyle = cCu;
 ctx_1_cursor.font = ctx_font;
 ctx_1_cursor.fillText( min2hm(x2t(x)), x+1, H);
 disp_compart_info(x);
}
function cursor_delete() {
 Canvas1CrossFix = false;
 ctx_1_cursor.clearRect(0, 0, W, H);
 ctx_2_cursor.clearRect(0, 0, W, H);
 ctx_3_cursor.clearRect(0, 0, W, H);
 ctx_4_cursor.clearRect(0, 0, W, H);
}

function create_new_row(){
 new Row();
 adjust_height();
}
function adjust_height(){
 document.getElementById('area1').style.height = (H + row_H * Row_arr.length) + "px";
}

/* dose entry */

var Setting = {
 is_pop_up: false,
 initialize: function(row){
  this.is_pop_up= true;
  this.row = row;
  this.edit_div= null;
  this.selected_agentunit_span= null;
  this.selected_changeunit_span= null;
  this.selected_preset_div= null;
  this.input_selected= false;
  this.previous_model = null;
  this.change_model = false;
 },
 select: function(button_div){
  this.selected_agentunit_span = button_div;
  this.temp_agent = button_div.getAttribute("agent");
  this.temp_unit = button_div.innerHTML;
  if( button_div === Setting.row.unit_span ){
   this.temp_label = Setting.row.label;
  } else {
   this.temp_label = this.temp_agent;
  }
  if(LabelInfoList[this.temp_label]){
   this.temp_labelinfo = {}
   for(key in LabelInfoList[this.temp_label]){
    this.temp_labelinfo[key] = LabelInfoList[this.temp_label][key];
   }
  } else {
   this.temp_labelinfo = new LabelInfo(this.temp_agent);
  }
 }
}
function drug_arr_ready(){
 var div = document.getElementById("PU_1_agent_list");
 while (div.firstChild) { div.removeChild(div.lastChild); }
// delete childnodes in case user has downloaded loaded HTML 
 var agent;
 for(agent in AgentInfoList){  
  var div_drug = document.createElement('div');
  var span1 = document.createElement('span');
  var span2 = document.createElement('span');
  div_drug.innerHTML = agent;
  span1.innerHTML = AgentInfoList[agent].bolus_unit; //"Bolus";
  span2.innerHTML = AgentInfoList[agent].infusion_unit; //"Infusion";
  setClass(span1, "button_wide");
  setClass(span2, "button_wide");
  span1.setAttribute("agent", agent);
  span2.setAttribute("agent", agent);
  span1.setAttribute("onclick", "select_drug(this);");
  span2.setAttribute("onclick", "select_drug(this);");
  div.appendChild(div_drug);
  div.appendChild(span1);
  div.appendChild(span2);
  AgentInfoList[agent].span_bolus = span1;
  AgentInfoList[agent].span_infusion = span2;
 }
}

function add_drug(n, time){
 if(Setting.is_pop_up){return;}
 Setting.initialize(Row_arr[n]);
 edit_mode(false);
 appear("PU_1_rowinfo");
 document.getElementById("entry_time").value = min2hm(time);
 if(Setting.row && Setting.row.agent){
  appear("delete_row_button");
  Row_arr[n].unit_span.innerHTML = Row_arr[n].unit;
  select_drug(Row_arr[n].unit_span);
  setClass(document.getElementById("dose_prev_button"), Setting.row.entry_arr.length>0? "button": "button_invalid" );
 }
 else{
  disappear("delete_row_button");
  setClass(document.getElementById("dose_prev_button"), "button_invalid");
 }
 setClass(document.getElementById("dose_next_button"), "button_invalid");
 manual_param_to(false);
}
function edit_drug(div){
 if(Setting.is_pop_up){return;}
 var n = parseInt(div.parentElement.getAttribute("n"));
 var row = Row_arr[n];
 var time = parseInt(div.getAttribute("time"));
 Setting.initialize(row);
 Setting.edit_div = div;
 document.getElementById("entry_time").value = min2hm(time);
 document.getElementById("dose").value = Setting.dose_selected = Setting.row.entry_at[time];
 if(Setting.dose_selected === undefined){ document.getElementById("dose").value = ""; }
 row.unit_span.innerHTML = row.unit;
 select_drug(row.unit_span);
 edit_mode(true);
 appear("PU_1_rowinfo");
 appear("delete_row_button");
 setClass(document.getElementById("dose_prev_button"), div.previousSibling? "button":"button_invalid");
 setClass(document.getElementById("dose_next_button"), div.nextSibling? "button":"button_invalid");
 manual_param_to(row.labelinfo.model_at[time]? true: false);
 setTimeout('document.getElementById("dose").select();',10);
 Setting.input_selected = true;
}

function select_drug(button_div){
 if(Setting.selected_agentunit_span){ setClass(Setting.selected_agentunit_span, "button_wide");}
 setClass(button_div, "button_wide_selected");
 Setting.select(button_div);
 appear("PU_2_entry");
 appear("PU_3_labelinfo");
 document.getElementById("PU_3_label").value = Setting.temp_label;
 document.getElementById("PU_3_color").value = Setting.temp_labelinfo.color;
 document.getElementById("PU_3_scale").value = Setting.temp_labelinfo.y_scale_50;
 document.getElementById("PU_3_mgmL").value = Setting.temp_labelinfo.mgmL;
/* select unit */
 var is_infusion = UnitInfoList[Setting.temp_unit].is_infusion;
 var unit_on = is_infusion? "select_infusion_unit": "select_bolus_unit";
 var unit_off = is_infusion? "select_bolus_unit" : "select_infusion_unit";
 appear(unit_on);
 disappear(unit_off);
 var j,unit_divlist = document.getElementById(unit_on).children;
 for(j=0; j<unit_divlist.length; j++){
  if(unit_divlist[j].children[1].innerHTML == Setting.temp_unit){
   change_unit(unit_divlist[j].children[1],false); break;
  }
 }
 change_unit_val(null);
/* check previous model */
// document.getElementById("entry_preset").innerHTML = "Preset";
 var ti,t_prev = hm2min(document.getElementById("entry_time").value)
 var t_arr = Setting.temp_labelinfo.model_arr;
 for(ti=t_arr.length-1;ti>=0;ti--){
  if(t_arr[ti] > t_prev)continue;
  var model = Setting.temp_labelinfo.model_at[t_arr[ti]];
  if(model){
//   document.getElementById("entry_preset").innerHTML = "Previous";
   Setting.previous_model = model;
   break;
  }
 }
/* select preset */
 model_ready(document.getElementById("preset_model"), AgentInfoList[Setting.temp_agent].preset_model_arr, "preset");
 model_ready(document.getElementById("TCI_model"), AgentInfoList[Setting.temp_agent].preset_model_arr, "TCI");
 document.getElementById("dose").focus();
}
function model_ready(div, preset_model_arr, mode){
 while(div.firstChild) { div.removeChild(div.lastChild); }
 var i,button_div = null;
 if(mode == "TCI"){
  var divchild = document.createElement("div");
  divchild.innerHTML = "TCIモデル:"
  div.appendChild(divchild);
 }
 for(i=0; i<preset_model_arr.length; i++){
  var divchild = document.createElement("div");
  divchild.innerHTML = preset_model_arr[i].label;
  divchild.setAttribute("onclick","change_preset(this);")
  divchild.setAttribute("i",i);
  divchild.setAttribute("mode", mode);
  setClass(divchild, "button_wide");
  div.appendChild(divchild);
  if(mode == "TCI" &&
     (Setting.row.TCI_model_g? Setting.row.TCI_model_g === preset_model_arr[i].model_g:Setting.temp_labelinfo.preset_model_g === preset_model_arr[i].model_g)
    || mode=="preset" && Setting.temp_labelinfo.preset_model_g === preset_model_arr[i].model_g){
   change_preset(divchild);
}}}

function edit_mode(b){
 document.getElementById("pop_up_mode").innerHTML = Lang=="en"? (b?"Edit mode":"Add mode"): (b?"編集モード":"追加モード");
 setClass(document.getElementById("pop_up_mode"), b?"mild_label_2":"mild_label");
 if(b){ appear("delete_entry_button"); }
 else{ disappear("delete_entry_button"); }
}
function change_label(input){
 if(LabelInfoList[input.value]){
  var labelinfo = LabelInfoList[input.value]
  var agent = labelinfo.agent;
  var is_infusion = UnitInfoList[Setting.temp_unit].is_infusion;
  var button_div = is_infusion? AgentInfoList[agent].span_infusion: AgentInfoList[agent].span_bolus;
  if(Setting.selected_agentunit_span){ setClass(Setting.selected_agentunit_span, "button_wide");}
  setClass(button_div, "button_wide_selected");
  Setting.select(button_div);
  document.getElementById("PU_3_color").value = labelinfo.color;
  document.getElementById("PU_3_scale").value = labelinfo.y_scale_50;
  document.getElementById("PU_3_mgmL").value = labelinfo.mgmL;
 } else {
  document.getElementById("PU_3_color").value = "#000000";
}}
function change_mgmL(input){
 var val = parseFloat(input.value);
 if(isNaN(val))return;
 Setting.temp_labelinfo.mgmL = val;
 input = Setting.selected_changeunit_span.parentElement.children[0];
 change_unit_val(input);
}
function change_unit_val(input){
 if(!input){
  input = Setting.selected_changeunit_span.parentElement.children[0];
  if(!input) return;
  input.value = document.getElementById("dose").value;
 }
 var val = parseFloat(input.value) 
 if(isNaN(val))return;
 var unit = input.parentElement.children[1].innerHTML;
 var j,div_arr = input.parentElement.parentElement.children;
 var mgmL = Setting.temp_labelinfo.mgmL;
 var mg = val * UnitInfoList[unit].calc_mg_per_val(Current_patient.weight, mgmL);
 for(j=0;j<div_arr.length;j++){
  var input_j = div_arr[j].children[0];
  if(input_j !== input){
   var unit_j = div_arr[j].children[1].innerHTML;
   if((unit_j.indexOf("g/mL")!=-1) != (unit.indexOf("g/mL")!=-1))continue;
   var new_val = mg / UnitInfoList[unit_j].calc_mg_per_val(Current_patient.weight, mgmL);
   input_j.value = myPrecision(new_val);
  } else {
   document.getElementById("dose").value = input_j.value;
  }
}}
function change_unit(button_div, is_new_val){
 var button_div = button_div.parentElement.children[1];
 var unit = button_div.innerHTML;
 if(Setting.selected_changeunit_span){ setClass(Setting.selected_changeunit_span, "button_wide");}
 setClass(button_div, "button_wide_selected");
 Setting.selected_changeunit_span = button_div;
 Setting.temp_unit = unit;
 document.getElementById("dose_unit").innerHTML = unit;
 Setting.selected_agentunit_span.innerHTML = unit;
 if(unit.indexOf("g/mL")!=-1){appear("TCI_model");}
 else {disappear("TCI_model");}
 if(is_new_val){
  if(button_div.parentElement.children[0].value){
   document.getElementById("dose").value = button_div.parentElement.children[0].value;
  }
  document.getElementById("dose").focus();
 }
}

function change_preset(button_div){
 var mode = button_div.getAttribute("mode");
 if(mode == "preset"){
  Setting.temp_labelinfo.preset_model_g = AgentInfoList[Setting.temp_agent].preset_model_arr[parseInt(button_div.getAttribute("i"))].model_g;
  if(Setting.selected_preset_div){ setClass(Setting.selected_preset_div, "button_wide");}
  setClass(button_div, "button_wide_selected");
  Setting.selected_preset_div = button_div;
  var i, itemlist = document.getElementById("PU_manual_model").children;
  for(i=0;i<7;i++){
   var div_i = itemlist[i];
   setClass(div_i.children[1], div_i.children[0].value == Setting.temp_labelinfo.preset_model_g(Current_patient)[param_arr[i]]? "button_wide_selected": "button_wide");
  }
 }
 else if(mode == "TCI"){
  Setting.temp_labelinfo.TCI_model_g = AgentInfoList[Setting.temp_agent].preset_model_arr[parseInt(button_div.getAttribute("i"))].model_g;
  if(Setting.TCI_model_button_div){ setClass(Setting.TCI_model_button_div, "button_wide");}
  setClass(button_div, "button_wide_selected");
  Setting.TCI_model_button_div = button_div;
 }
}
function dose_input(x){
 if(Setting.input_selected){
  if(document.getElementById("dose").value == Setting.dose_selected){ // if there was no keyboard input
   document.getElementById("dose").value = "";
  }
  Setting.input_selected = false;
 }
 if(x=="." && document.getElementById("dose").value.indexOf(".")!=-1){ return; }
 if(x=="clear"){ document.getElementById("dose").value = ""; }
 else if(x=="BS"){ document.getElementById("dose").value = document.getElementById("dose").value.slice( 0, -1 ); }
 else {document.getElementById("dose").value = document.getElementById("dose").value + x;}
 document.getElementById("dose").focus();
 change_unit_val(null);
}
function set_time_now(){
 var time = (new Date()).getHours()*60 + (new Date()).getMinutes();
 document.getElementById("pop_up_overwriting").style.display
 = (Setting.row.entry_at[time] == undefined || Setting.edit_div && time == Setting.edit_div.getAttribute("time") ) ? "none" : "inline";
 document.getElementById("entry_time").value = min2hm(time);
}
function entry_time_c(dt){
 var time =  hm2min(document.getElementById("entry_time").value) + parseInt(dt);
 document.getElementById("pop_up_overwriting").style.display
 = (Setting.row.entry_at[time] === undefined || Setting.edit_div && time == Setting.edit_div.getAttribute("time") ) ? "none" : "inline";
 document.getElementById("entry_time").value = min2hm(time);
}
function dose_done(){
 if(!Setting.is_pop_up){return;} // prevent double action by onkeydown and onsubmit
 if(!Setting.selected_agentunit_span){return;} // no drug chosen
 var old_label = Setting.row.label;
// var old_mgmL = Setting.row.labelinfo.mgmL ;
 Setting.temp_label = document.getElementById("PU_3_label").value;
 var val = parseFloat(document.getElementById("PU_3_scale").value);
 if(!isNaN(val)) { Setting.temp_labelinfo.y_scale_50 = val; }
 Setting.temp_labelinfo.color = document.getElementById("PU_3_color").value;
/* new_register */
 if(Setting.row.agent==""){
  Setting.row.register(Setting.temp_label, Setting.selected_agentunit_span)
  create_new_row();
 }
 else{
/* change agent */
  if(Setting.row.unit_span != Setting.selected_agentunit_span){
   Setting.row.agent = Setting.temp_agent;
   Setting.row.unit_span = Setting.selected_agentunit_span;
  }
/* change label, labelinfo */
  if(Setting.temp_label != Setting.row.label){
   Setting.row.change_label(Setting.temp_label);
  }
 }
/* change unit */
 if( Setting.row.unit != Setting.temp_unit || Setting.temp_unit.indexOf("mL")!=-1 &&  Setting.row.labelinfo.mgmL != Setting.temp_labelinfo.mgmL ){
  Setting.row.update_value( Setting.temp_unit, Setting.temp_labelinfo.mgmL);
  Setting.row.unit = Setting.temp_unit;
 }
 var is_TCI = Setting.temp_unit.indexOf("g/mL")!=-1;
 Setting.row.TCI_model_g = is_TCI? Setting.temp_labelinfo.TCI_model_g: null;
/* update labelinfo */
 var labelinfo = LabelInfoList[Setting.row.label]
 labelinfo.y_scale_50 = Setting.temp_labelinfo.y_scale_50;
 labelinfo.color = Setting.temp_labelinfo.color;
 labelinfo.mgmL = Setting.temp_labelinfo.mgmL;
 labelinfo.preset_model_g = Setting.temp_labelinfo.preset_model_g;
/* label display */
 Setting.row.labelarea_div.innerHTML = Setting.row.label + "("+Setting.row.unit+")"; 
 Setting.row.labelarea_div.style.color = LabelInfoList[Setting.row.label].color;
/* entry */
 var time = hm2min( document.getElementById("entry_time").value  );
 if( isNaN(time) ){
  time = 0;
  alert(Lang=="jp"?"0:00に登録しました(時刻形式が不正)":"Registered at 0:00 (invalid input)")
 }
 var dose = parseFloat(document.getElementById("dose").value);
 var div = Setting.edit_div;
 if( div && (Setting.change_model || !isNaN(dose)) ){ // change data
  Setting.row.delete_data(parseInt(Setting.edit_div.getAttribute("time")));
 }
 var changed_model = null;
 if(Setting.change_model){
  var i, itemlist = document.getElementById("PU_manual_model").children;
  var params = [];
  for(i=0;i<7;i++){ params.push( parseFloat(itemlist[i].children[0].value) ); }
  changed_model = model_from_VQ(params[0],params[1],params[2],params[3],params[4],params[5],params[6]);
 }
 if(changed_model || !isNaN(dose)){
  Setting.row.add_data(time, dose, changed_model, div);
 }
 var n;for(n=0;n<Row_arr.length;n++){
  var row = Row_arr[n];
  if(row.labelinfo && row.labelinfo.preset_model_g == model_P_A2005 || row.TCI_model_g == model_P_A2005 ){
   if( Current_patient.age>16 && row.labelarea_div.className == "labelarea_on" ) {
    setClass(row.labelarea_div, "labelarea_off");
    setClass(row.dosearea_div, "dosearea_off");
 }}}
 dose_close();
 update_graph();
}
function dose_close(){
 if(Setting.selected_agentunit_span){
  setClass(Setting.selected_agentunit_span, "button_wide");
 }
 if(Setting.selected_changeunit_span){
  setClass(Setting.selected_changeunit_span, "button_wide");
 }
 document.getElementById("dose").value = "";
 var j,unit_divlist = document.getElementById("select_bolus_unit").children;
 for(j=0; j<unit_divlist.length; j++){ unit_divlist[j].children[0].value = ""; }
 unit_divlist = document.getElementById("select_infusion_unit").children;
 for(j=0; j<unit_divlist.length; j++){ unit_divlist[j].children[0].value = ""; }
 disappear("PU_1_rowinfo");
 disappear("PU_2_entry");
 disappear("PU_3_labelinfo");
 document.getElementById("pop_up_overwriting").style.display = "none";
 Setting.is_pop_up = false;
}
function dose_delete(){
 Setting.row.delete_data(parseInt(Setting.edit_div.getAttribute("time")));
 Setting.edit_div.parentElement.removeChild(Setting.edit_div);
 dose_close();
 update_graph();
}
function dose_prev(){
 if(document.getElementById("dose_prev_button").className == "button_invalid")return;
 document.getElementById("pop_up_overwriting").style.display = "none";
 var div = Setting.edit_div;
 if(div){
  Setting.is_pop_up = false;
  edit_drug( div.previousSibling );
 }
 else{
  var child_arr = Setting.row.dosearea_div.childNodes;
  Setting.is_pop_up = false;
  edit_drug( Setting.row.dosearea_div.lastChild );
}}
function dose_next(){
 if(document.getElementById("dose_next_button").className == "button_invalid")return;
 document.getElementById("pop_up_overwriting").style.display = "none";
 Setting.is_pop_up = false;
 edit_drug( Setting.edit_div.nextSibling );
}
function delete_current_row(){
 var n = Setting.row.n;
 if(!confirm(
  Lang=="en"?
  "Are you sure to delete all data in this row " + Setting.row.label+"("+ Setting.row.unit + ")?":
  "行" + Setting.row.label+"("+ Setting.row.unit + ")を削除します"
  ))return;
 delete_row(n);
}
function delete_row(n){
 var div_arr = document.getElementById("row_container").children;
 var i;
 for(i=Row_arr.length-1;i>n;i--){
  Row_arr[i].n = i-1;
  if(Row_arr[i].dosearea_div){
   Row_arr[i].dosearea_div.setAttribute("n", i-1);
   Row_arr[i].dosearea_div.style.top = (i-1)*row_H + "px";
  }
  if(Row_arr[i].labelarea_div){
   Row_arr[i].labelarea_div.setAttribute("n", i-1);
   Row_arr[i].labelarea_div.style.top = (i-1)*row_H + "px";
 }}
 document.getElementById("row_container").removeChild(Row_arr[n].dosearea_div)
 document.getElementById("row_container").removeChild(Row_arr[n].labelarea_div)
 Row_arr[n].delete();
 dose_close();
 adjust_height();
 update_graph();
}

/* manual model edit */

var param_arr = ["V1","V2","V3","CL","Q2","Q3","ke"];

function manual_param_switch(){
 manual_param_to(!Setting.change_model);
}
function manual_param_to(b){
// setClass( document.getElementById("entry_manual"), b? "button_wide_selected": "button_wide")
// setClass( document.getElementById("entry_preset"), b? "button_wide": "button_wide_selected")
 Setting.change_model = b;
 if(!b){
  disappear("PU_manual_model");
 } else {
  appear("PU_manual_model");
  var i, itemlist = document.getElementById("PU_manual_model").children;
  for(i=0;i<7;i++){
   var div_i = itemlist[i];
   if(Setting.previous_model){
    div_i.children[0].value = Setting.previous_model[param_arr[i]];
    setClass(div_i.children[1], div_i.children[0].value == Setting.temp_labelinfo.preset_model_g(Current_patient)[param_arr[i]]? "button_wide_selected": "button_wide");
    setClass(div_i.children[2], "button_wide_selected");
   } else {
    div_i.children[0].value = Setting.temp_labelinfo.preset_model_g(Current_patient)[param_arr[i]];
    setClass(div_i.children[1], "button_wide_selected");
    setClass(div_i.children[2], "none");
}}}}

function manual_param(input){
 var div_i = input.parentElement;
 var i = parseInt(div_i.getAttribute("i"));
 setClass(div_i.children[1], input.value == Setting.temp_labelinfo.preset_model_g(Current_patient)[param_arr[i]]? "button_wide_selected": "button_wide");
 setClass(div_i.children[2], Setting.previous_model? (input.value == Setting.previous_model[param_arr[i]]? "button_wide_selected": "button_wide"): "none");
}
function preset_param(div){
 if( div.className == "button_wide_selected") return;
 var div_i = div.parentElement;
 var i = parseInt(div.parentElement.getAttribute("i"));
 div_i.children[0].value = Setting.temp_labelinfo.preset_model_g(Current_patient)[param_arr[i]];
 setClass(div_i.children[1], "button_wide_selected");
 setClass(div_i.children[2], Setting.previous_model? (div_i.children[0].value == Setting.previous_model[param_arr[i]]? "button_wide_selected": "button_wide"): "none");
}
function previous_param(div){
 if( div.className == "button_wide_selected") return;
 var div_i = div.parentElement;
 var i = parseInt(div.parentElement.getAttribute("i"));
 div_i.children[0].value = Setting.previous_model[param_arr[i]];
 setClass(div_i.children[1], div_i.children[0].value == Setting.temp_labelinfo.preset_model_g(Current_patient)[param_arr[i]]? "button_wide_selected": "button_wide");
 setClass(div_i.children[2], "button_wide_selected");
}

/* compartment visualization */

var Compart = {
 O_y_top: 5,
 div: null,
 C1:[], C2:[], C3:[], infusion_rate:[], model:[], total:[],
 C1expr:[], C2expr:[], C3expr:[], Ciexpr:[], Ceexpr:[]
}
function compart_ready(){
 document.getElementById("area2").style.height = H + 50 + "px";
 document.getElementById("area3").style.height = H + 0 + "px";
 document.getElementById("area4").style.height = H + 0 + "px";
 document.getElementById("comp_2").style.height = H-O_y-Compart.O_y_top + "px";
 document.getElementById("comp_1").style.height = H-O_y-Compart.O_y_top + "px";
 document.getElementById("comp_3").style.height = H-O_y-Compart.O_y_top + "px";
 document.getElementById("comp_2").style.top = Compart.O_y_top + "px";
 document.getElementById("comp_1").style.top = Compart.O_y_top + "px";
 document.getElementById("comp_3").style.top = Compart.O_y_top + "px";
 document.getElementById("comp_info_2").style.top = Compart.O_y_top + "px";
 document.getElementById("comp_info_1").style.top = Compart.O_y_top + "px";
 document.getElementById("comp_info_3").style.top = Compart.O_y_top + "px";
 document.getElementById("compline_10").style.top = H-O_y + "px";
 document.getElementById("compequation").style.top = H + "px";
 document.getElementById("compline_12").style.width = CompLineWidth + "px";
 document.getElementById("compline_13").style.width = CompLineWidth + "px";
 document.getElementById("compline_10").style.height = CompLineWidth + "px";
 document.getElementById("compline_info_10").style.top = H + "px";
 document.getElementById("compline_info_10").style.width = CompLineWidth + "px";
 document.getElementById("compline_info_12").style.width = CompLineWidth + "px";
 document.getElementById("compline_info_12").style.top = "60px"; //
 document.getElementById("compline_info_13").style.top = "60px"; //
 document.getElementById("compline_info_13").style.width = CompLineWidth + "px";
 document.getElementById("compline_info_in").style.top = "-16px";
 document.getElementById("compline_info_in").style.width = CompLineWidth + "px";
 document.getElementById("comp_out").style.top = H-O_y + CompLineWidth + "px";
 document.getElementById("comp_out").style.width = CompLineWidth + "px";
 var div = document.getElementById("compart_label_container");
 while (div.firstChild) { div.removeChild(div.lastChild); }
}
function create_compart_label_div(label){
 var div = document.createElement("div");
 div.innerHTML = label;
 div.style.minWidth = "50px"; ////////
 setClass(div, "button_wide");
 div.setAttribute("onclick", "set_compart(this);update_graph();");
 document.getElementById("compart_label_container").appendChild(div);
 return div;
}
function delete_compart_label_div(div){
 if(Compart.div === div){ set_compart( null ); }
 document.getElementById("compart_label_container").removeChild(div);
}
function set_compart(div){
 if( Compart.div ) setClass(Compart.div, "button_wide"); // unselect old one
 Compart.div = div;
 if(div){ setClass(div, "button_wide_selected"); }
 compart_initialize();
}
function compart_initialize(){
 if(Compart.div){ disp_compart( LabelInfoList[Compart.div.innerHTML].preset_model_g(Current_patient) ); }
 else{ hide_compart(); }
}
function disp_compart(model){
 var L2 = Math.sqrt(model.V2)*30;
 var L1 = Math.sqrt(model.V1)*30;
 var L3 = Math.sqrt(model.V3)*30;
 var L12 = model.Q2*20;
 var L13 = model.Q3*20;
 var L10 = model.CL*20;
 document.getElementById("comp_2").style.width = L2 + "px"
 document.getElementById("comp_1").style.width = L1 + "px";
 document.getElementById("comp_3").style.width = L3 + "px";
 document.getElementById("comp_inner_2").style.width = L2 + "px"
 document.getElementById("comp_inner_1").style.width = L1 + "px";
 document.getElementById("comp_inner_3").style.width = L3 + "px";
 document.getElementById("comp_info_2").innerHTML = model.V2.toFixed(2) + "L"
 document.getElementById("comp_info_1").innerHTML = model.V1.toFixed(2) + "L"
 document.getElementById("comp_info_3").innerHTML = model.V3.toFixed(2) + "L"
 document.getElementById("comp_info_2").width = L2 + CompLineWidth + "px";
 document.getElementById("comp_info_1").width = L1 + CompLineWidth + "px";
 document.getElementById("comp_info_3").width = L3 + CompLineWidth + "px";
 document.getElementById("compline_12").style.height = L12 + "px";
 document.getElementById("compline_13").style.height = L13 + "px";
 document.getElementById("compline_10").style.width = L10 + "px";
 document.getElementById("compline_12").style.top = H-O_y-L12 + "px";
 document.getElementById("compline_13").style.top = H-O_y-L13 + "px";
 var m_left = O_x;
 document.getElementById("comp_2").style.left = m_left + "px";
 document.getElementById("comp_1").style.left = m_left + L2 + CompLineWidth + "px";
 document.getElementById("comp_3").style.left = m_left + L2 + CompLineWidth + L1 + CompLineWidth + "px";
 document.getElementById("comp_info_2").style.left = m_left + "px";
 document.getElementById("comp_info_1").style.left = m_left + L2 + CompLineWidth + "px";
 document.getElementById("comp_info_3").style.left = m_left + L2 + CompLineWidth + L1 + CompLineWidth + "px";
 document.getElementById("comp_out").style.left = m_left + L2 + CompLineWidth + L1/2 - L10/2 + "px";
 document.getElementById("compline_12").style.left = m_left + L2 + "px";
 document.getElementById("compline_13").style.left = m_left + L2 + CompLineWidth + L1 + "px";
 document.getElementById("compline_10").style.left = m_left + L2 + CompLineWidth + L1/2 - L10/2 + "px";
 document.getElementById("compline_info_12").style.left = m_left + L2 + "px";
 document.getElementById("compline_info_13").style.left = m_left + L2 + CompLineWidth + L1 + "px";
 document.getElementById("compline_info_10").style.left = m_left + L2 + CompLineWidth + L1/2 - L10/2 + "px";
 document.getElementById("compline_info_in").style.left = m_left + L2 + CompLineWidth + L1/2 - L10/2 + "px";
 document.getElementById("compequation").style.left = m_left + L2 + CompLineWidth + L1/2 - L10/2 + 120 + "px";
// document.getElementById("compline_info_in").style.width is 80px
 document.getElementById("comp_inner_1").style.height = "0px";
 document.getElementById("comp_inner_2").style.height = "0px";
 document.getElementById("comp_inner_3").style.height = "0px";
 document.getElementById("compline_info_in").innerHTML = "";
 document.getElementById("compline_info_12").innerHTML = "";
 document.getElementById("compline_info_13").innerHTML = "";
 document.getElementById("compline_info_10").innerHTML = "";
 disappear("compequation");
}
function hide_compart(){
 document.getElementById("comp_2").style.left = "-999px";
 document.getElementById("comp_1").style.left = "-999px";
 document.getElementById("comp_3").style.left = "-999px";
 document.getElementById("comp_info_2").style.left = "-999px";
 document.getElementById("comp_info_1").style.left = "-999px";
 document.getElementById("comp_info_3").style.left = "-999px";
 document.getElementById("comp_out").style.left = "-999px";
 document.getElementById("compline_12").style.left = "-999px";
 document.getElementById("compline_13").style.left = "-999px";
 document.getElementById("compline_10").style.left = "-999px";
 document.getElementById("compequation").style.left = "-999px";
 document.getElementById("compline_info_12").style.left = "-999px";
 document.getElementById("compline_info_13").style.left = "-999px";
 document.getElementById("compline_info_10").style.left = "-999px";
 document.getElementById("compline_info_in").style.left = "-999px";
}
function disp_compart_info(x0){
 if(!Compart.div) return;
 var x = Math.floor(x0/Canvas_common.dx);
 if(x<0 || x>=Canvas_common.x_arr.length) return;
 var model = Compart.model[x];
 if(!model){ hide_compart();return;}
 disp_compart(model);
 var label = Compart.div.innerHTML;
 var unit = LabelInfoList[label].y_scale_50>10? "mg": "μg"; // this is arbitrary
 var c = unit=="μg"?1000:1;
 var C1h = Math.min(H, Compart.C1[x]*1000*50/LabelInfoList[label].y_scale_50);
 var C2h = Math.min(H, Compart.C2[x]*1000*50/LabelInfoList[label].y_scale_50);
 var C3h = Math.min(H, Compart.C3[x]*1000*50/LabelInfoList[label].y_scale_50);
 document.getElementById("comp_inner_1").style.height = C1h + "px";
 document.getElementById("comp_inner_2").style.height = C2h + "px";
 document.getElementById("comp_inner_3").style.height = C3h + "px";
 document.getElementById("comp_inner_1").style.top = H-O_y-Compart.O_y_top-C1h + "px";
 document.getElementById("comp_inner_2").style.top = H-O_y-Compart.O_y_top-C2h + "px";
 document.getElementById("comp_inner_3").style.top = H-O_y-Compart.O_y_top-C3h + "px";
 var flow12 = model.Q2 * (Compart.C1[x] - Compart.C2[x]) * 60 * c;
 var flow13 = model.Q3 * (Compart.C1[x] - Compart.C3[x]) * 60 * c;
 var flow10 = model.CL * Compart.C1[x] * 60 * c;
 var dA1 = Compart.infusion_rate[x] * 60 * c - flow12 - flow13 - flow10;
 document.getElementById("compline_info_in").innerHTML = ( Compart.infusion_rate[x]!=0? "↓" + myPrecision(Compart.infusion_rate[x]*60*c) + unit + "/h, ":"")
  + "Total " + myPrecision(Compart.total[x]*c) + unit;
 document.getElementById("comp_info_1").innerHTML = (Compart.C1[x]*model.V1*c).toPrecision(3) + unit + "/" + model.V1.toPrecision(3) + "L"
  + "<br>" + myPrecision_signed(dA1) + unit + "/h";
 document.getElementById("comp_info_2").innerHTML = (Compart.C2[x]*model.V2*c).toPrecision(3) + unit + "/" + model.V2.toPrecision(3) + "L";
 document.getElementById("comp_info_3").innerHTML = (Compart.C3[x]*model.V3*c).toPrecision(3) + unit + "/" + model.V3.toPrecision(3) + "L";
 document.getElementById("compline_info_12").innerHTML =  (flow12>=0?"←"+myPrecision(flow12):"→"+myPrecision(-flow12)) + unit + "/h";
 document.getElementById("compline_info_13").innerHTML =  (flow13>=0?"→"+myPrecision(flow13):"←"+myPrecision(-flow13)) + unit + "/h";
 document.getElementById("compline_info_10").innerHTML = "↓" + myPrecision(flow10) + unit + "/h";
 appear("compequation");
 if(Compart.Ciexpr[x].t != t_MIN){
  document.getElementById("compequation_inner").innerHTML = 
    "infusion = " + (Compart.Ciexpr[x].scaler(60*c).display() || 0) + " [" + unit + "/h]<br>"
   + "C<sub>1</sub> = " + (Compart.C1expr[x].scaler(c).display() || 0) + " [" + (unit=="mg"?"µg":"ng") + "/L]<br>"
   + "C<sub>2</sub> = " + (Compart.C2expr[x].scaler(c).display() || 0) + " [" + (unit=="mg"?"µg":"ng") + "/L]<br>"
   + "C<sub>3</sub> = " + (Compart.C3expr[x].scaler(c).display() || 0) + " [" + (unit=="mg"?"µg":"ng") + "/L]<br>"
   + "C<sub>e</sub> = " + (Compart.Ceexpr[x].scaler(c).display() || 0) + " [" + (unit=="mg"?"µg":"ng") + "/L]<br>"
   + " t = time from " + min2hm(Compart.Ciexpr[x].t) + " [min]<br>";
 }
 document.getElementById("area2").style.height = H + Math.max(50,document.getElementById("compequation").clientHeight) + "px";
}

function expand_equation(){
 appear_disappear("compequation_inner");
 document.getElementById("area2").style.height = H + Math.max(50,document.getElementById("compequation").clientHeight) + "px";
}

/* output, load */

function output_data(){
 var temp_object = {};
 temp_object.patient = Current_patient;
 temp_object.t1 = Canvas_common.t1;
 temp_object.t_scale = Canvas_common.t_scale_150;
 temp_object.data = LabelInfoList;
 document.getElementById("output_data_area").value = JSON.stringify(temp_object, null, 1);
}

function load_data(){
 var temp_object;
 try{
  temp_object = JSON.parse(document.getElementById("output_data_area").value.replace(/[\n\r]/g, ""));
 } catch(e){
  alert(e);
  return;
 }
 if(!temp_object.data){
  console.log("No data");
  return;
 }
 if(!confirm(Lang=="en"?"Are you sure to remove current data?":"現在の情報は上書きされます"))return;
 if(temp_object.patient){
  document.getElementById("age").value = temp_object.patient.age;
  document.getElementById("sex").value = temp_object.patient.sex;
  document.getElementById("height").value = temp_object.patient.height;
  document.getElementById("weight").value = temp_object.patient.weight;
  document.getElementById("high_ASA").value = temp_object.patient.high_ASA?"1":"0";
 }
 load_patient() //v1.6.2
 update_x_axis(parseInt(temp_object.t1||0), parseInt(temp_object.t_scale||60));
 var ri; for(ri=Row_arr.length-2; ri>=0; ri--){
  delete_row(ri);
 }
 for(label in temp_object.data){
  var labelinfo = temp_object.data[label];
  var agent = labelinfo.agent;
  if(!AgentInfoList[agent]){
   console.log("Invalid agent");
   continue;
  }
  var row, row_arr = labelinfo.row_arr;
  if(!row_arr.length){
   console.log("Invalid row_arr");
   continue;
  }
  for(ri=0; ri<row_arr.length; ri++){
   row = Row_arr[Row_arr.length-1];
   var unit = row_arr[ri].unit;
   unit = unit.split("ug").join("μg").split("mcg").join("μg");
   if(!UnitInfoList[unit]){
    console.log("Invalid unit");
    continue;
   }
   var unit_span = UnitInfoList[unit].is_infusion? AgentInfoList[agent].span_infusion: AgentInfoList[agent].span_bolus;
   unit_span.innerHTML = unit;
   row.register(label, unit_span)
   if(row_arr[ri].TCI_model_g){
    row.TCI_model_g = Modelname2func[row_arr[ri].TCI_model_g];
   }
   var t; for(t in row_arr[ri].entry_at){
    row.add_data(parseInt(t), row_arr[ri].entry_at[t], null, null);
   }
   row.labelarea_div.innerHTML = label + "(" + unit + ")"; 
   if(labelinfo.color){ row.labelarea_div.style.color = labelinfo.color; }
   create_new_row();
  }
  if(labelinfo.preset_model_g){
   LabelInfoList[label].preset_model_g = Modelname2func[labelinfo.preset_model_g];
  }
  var ki, keys = ["mgmL","y_scale_50","color"];
  for(ki=0; ki<keys.length; ki++){
   var key = keys[ki];
   if(labelinfo[key]){
    LabelInfoList[label][key] = labelinfo[key];
   }
  }
  var t; for(t in labelinfo.model_at){
   var dose = NaN;
   if( row.entry_at[t] ){
    dose = row.entry_at[t];
    row.delete_data(t);
   }
   var model = new Model();
   var key; for(key in labelinfo.model_at[t]){
    model[key] = labelinfo.model_at[t][key];
   }
   row.add_data(parseInt(t), dose, model, null);
  }
 }
 adjust_height();
 update_graph();
}

function output_conc(){
 var temp_object = {};
 var csv_data = [];
 var t1 = hm2min(document.getElementById("output_t1").value);
 var t2 = hm2min(document.getElementById("output_t2").value);
 var disp_dt = parseFloat(document.getElementById("output_dt").value);
 if(isNaN(t1)){
  document.getElementById("output_conc_area").value = "Invalid start-time.";
  return;  
 }
 if(isNaN(t2)){
  document.getElementById("output_conc_area").value = "Invalid end-time.";
  return;  
 }
 if(t1>t2){
  document.getElementById("output_conc_area").value = "Set end-time later than start-time.";
  return;   
 }
 if(isNaN(disp_dt) || disp_dt<=0){
  document.getElementById("output_conc_area").value = "Set positive offset.";
  return;
 }
 var dt = disp_dt / parseInt(document.getElementById("output_t_scale").value);
 var t_unit = document.getElementById("output_t_scale").value=="60"?"sec":"min";
 var x, t_arr = [], disp_t_arr = [];
 for(x=0; x<(t2-t1)/dt; x++){
  var t = t1 + x*dt;
  var disp_t = x*disp_dt;
  t_arr.push(t);
  disp_t_arr.push(disp_t);
 }
 temp_object["dt_" + t_unit] = disp_t_arr.join(",");
 csv_data.push("dt_" + t_unit + "," + disp_t_arr.join(","))
 for(label in LabelInfoList){
  var labelinfo = LabelInfoList[label];
  temp_object[label] = labelinfo.simulate_t_arr(t_arr);
  for(key in temp_object[label]){
   csv_data.push(label + ":" + key + "," + temp_object[label][key]);
  }
 }
 document.getElementById("output_conc_area").value = JSON.stringify(temp_object, null, 1).replace(/\"/g, "");
 if( document.getElementById("output_csv").checked ){
  var filename = "output.csv";
  var blob = new Blob([csv_data.join("\n")],{type:"text/csv"});
  if (window.navigator.msSaveBlob) {
   window.navigator.msSaveBlob(blob, filename);
  }
  var mylink = document.createElement('a');
  mylink.href = URL.createObjectURL(blob);
  mylink.download = filename;
  mylink.click();
 }
}
/* https://into-the-program.com/javascript-download-csv/ */

function area4_output_conc(){
 var temp_object = {};
 var csv_data = [];
 var t1 = hm2min(document.getElementById("area4_output_t1").value);
 var t2 = hm2min(document.getElementById("area4_output_t2").value);
 var disp_dt = parseFloat(document.getElementById("area4_output_dt").value);
 if(isNaN(t1)){
  document.getElementById("area4_output_conc_area").value = "Invalid start-time.";
  return;  
 }
 if(isNaN(t2)){
  document.getElementById("area4_output_conc_area").value = "Invalid end-time.";
  return;  
 }
 if(t1>t2){
  document.getElementById("area4_output_conc_area").value = "Set end-time later than start-time.";
  return;   
 }
 if(isNaN(disp_dt) || disp_dt<=0){
  document.getElementById("area4_output_conc_area").value = "Set positive offset.";
  return;
 }
 var dt = disp_dt / parseInt(document.getElementById("area4_output_t_scale").value);
 var t_unit = document.getElementById("area4_output_t_scale").value=="60"?"sec":"min";
 var x, t_arr = [], disp_t_arr = [];
 for(x=0; x<(t2-t1)/dt; x++){
  var t = t1 + x*dt;
  var disp_t = x*disp_dt;
  t_arr.push(t);
  disp_t_arr.push(disp_t);
 }
 temp_object["dt_" + t_unit] = disp_t_arr.join(",");
 csv_data.push("dt_" + t_unit + "," + disp_t_arr.join(","))
 for(label in LabelInfoList){
  var indi,labelinfo = LabelInfoList[label];
  if(labelinfo.agent == "Fentanyl"){
   for(indi=0;indi<area4_M;indi++){
    var model_rand = model_F_B2020_rand(Current_patient, Fentanyl_rands_list[indi]);
    label_i = label+"_sample_"+indi
    temp_object[label_i] = labelinfo.simulate_t_arr_rand(t_arr, model_rand);
    for(key in temp_object[label_i]){
     csv_data.push(label_i + ":" + key + "," + temp_object[label_i][key]);
    }
 }}}
 document.getElementById("area4_output_conc_area").value = JSON.stringify(temp_object, null, 1).replace(/\"/g, "");
 if( document.getElementById("area4_output_csv").checked ){
  var filename = "fentanyl_output.csv";
  var blob = new Blob([csv_data.join("\n")],{type:"text/csv"});
  if (window.navigator.msSaveBlob) {
   window.navigator.msSaveBlob(blob, filename);
  }
  var mylink = document.createElement('a');
  mylink.href = URL.createObjectURL(blob);
  mylink.download = filename;
  mylink.click();
 }
}

function my_keydown(e){
 if(e.keyCode==13&&Setting.is_pop_up){dose_done();}
 if(e.keyCode==27){dose_close();}
}

function my_onload(){
 ready();
 document.getElementById('age').focus();
// document.body.onkeydown = function(e) { my_keydown(e) };
 setEvent(document.body, "keydown", my_keydown);
}

setEvent(window, "load", my_onload);
