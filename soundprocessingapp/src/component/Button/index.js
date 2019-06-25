import React, { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography } from '../../assets/styles';

class Button extends Component {
  constructor(props) {
    super(props);
    this.state = {
    };
  }

  render() {
    return (
      <TouchableOpacity {...this.props} 
      style={[styles.button,
       {backgroundColor: this.props.background,
       width: this.props.buttonWidth}, this.props.style]}>
        <Text style={{color: this.props.labelColor || colors.LIGHT_TEXT, fontFamily:typography.FONT_DEFALT}}>{this.props.label}</Text>
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  }
});

export default Button;
