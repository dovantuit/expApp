import layout from "../layout";

const XS = 8;
const SM = 12;
const MD = 16;
const LG = 20;
const XL = 24;

const SM_TEXT = layout.IS_SMALL_DEVICE ? XS : SM;
const MD_TEXT = layout.IS_SMALL_DEVICE ? SM : MD;
const LG_TEXT = layout.IS_SMALL_DEVICE ? MD : LG;
const XL_TEXT = layout.IS_SMALL_DEVICE ? LG : XL;
const FONT_DEFALT ='Helvetica';

export default {
  SM_TEXT,
  MD_TEXT,
  LG_TEXT,
  XL_TEXT,
  XS,
  XL,
  FONT_DEFALT
}