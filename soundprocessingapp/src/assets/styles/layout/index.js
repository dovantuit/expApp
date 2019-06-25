import { Dimensions } from 'react-native';

const VW = Dimensions.get('window').width;
const VH = Dimensions.get('window').height;

export default {
  VW,
  VW,
  IS_SMALL_DEVICE: VW < 350
}