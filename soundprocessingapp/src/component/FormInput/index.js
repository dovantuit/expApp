import React, { Component } from 'react'
import { AppRegistry ,Text, View, TextInput, StyleSheet } from 'react-native'
import { colors, typography } from '../../assets/styles'

class Input extends Component {
  constructor(props) {
    super(props)
    this.state = {
      borderInput: colors.GRAY
    }
  }

  render() {
    const { borderInput } = this.state;
    return (
      <View style={styles.container}>
        <Text style={{ fontSize: typography.MD_TEXT, color: colors.TEXT, fontFamily:typography.FONT_DEFALT }}>{this.props.label}</Text>
        <TextInput
          {...this.props}
          placeholder={this.props.label}
          style={{ height: 40, borderColor: borderInput, borderWidth: 1, borderRadius: 5, fontFamily:typography.FONT_DEFALT }}
          onFocus={() => {this.setState({ borderInput: colors.BORDER_INPUT })}}
          onBlur={() => {this.setState({ borderInput: colors.GRAY })}}
        />
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 15,
    backgroundColor: colors.BG_COLOR
  }
})

export default Input
